"""Birim Satis Fiyati Hesaplayici - Streamlit Uygulamasi."""

import csv
import os
import sqlite3
import uuid
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from io import BytesIO, StringIO

import requests
import streamlit as st
from openpyxl import Workbook

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(BASE_DIR, "data", "calculations.db"))

try:
    MAX_RECORDS = max(1, int(os.environ.get("MAX_RECORDS", "500")))
except ValueError:
    MAX_RECORDS = 500

FACTORIES = {
    "adana": "Adana",
    "trabzon": "Trabzon",
    "gebze": "Gebze",
}


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calculations (
            id TEXT PRIMARY KEY,
            product_name TEXT NOT NULL,
            dealer TEXT NOT NULL,
            dealer_customer TEXT NOT NULL,
            calculation_date TEXT NOT NULL,
            usd_rate REAL NOT NULL,
            eur_rate REAL NOT NULL,
            chf_rate REAL NOT NULL,
            factory TEXT NOT NULL,
            shipping_city TEXT NOT NULL DEFAULT '',
            shipping_cost REAL NOT NULL,
            shipping_cost_usd REAL NOT NULL DEFAULT 0,
            nts_cost REAL NOT NULL,
            margin REAL NOT NULL,
            result_tl REAL NOT NULL,
            result_usd REAL NOT NULL,
            result_eur REAL NOT NULL,
            result_chf REAL NOT NULL,
            result_tl_ton REAL NOT NULL DEFAULT 0,
            result_usd_ton REAL NOT NULL DEFAULT 0,
            result_eur_ton REAL NOT NULL DEFAULT 0,
            result_chf_ton REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def enforce_max_records(conn):
    count = conn.execute("SELECT COUNT(*) FROM calculations").fetchone()[0]
    if count > MAX_RECORDS:
        excess = count - MAX_RECORDS
        conn.execute(
            """
            DELETE FROM calculations WHERE id IN (
                SELECT id FROM calculations ORDER BY created_at ASC LIMIT ?
            )
            """,
            (excess,),
        )


def list_calculations():
    conn = get_db()
    rows = conn.execute("SELECT * FROM calculations ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_calculation(calc_id):
    conn = get_db()
    conn.execute("DELETE FROM calculations WHERE id = ?", (calc_id,))
    conn.commit()
    conn.close()


def parse_tcmb_xml(xml_text):
    root = ET.fromstring(xml_text)
    date_str = root.attrib.get("Tarih", "")

    rates = {"usd": 0.0, "eur": 0.0, "chf": 0.0, "date": date_str}
    for currency in root.findall("Currency"):
        code = currency.attrib.get("CurrencyCode", "")
        forex_selling = currency.find("ForexSelling")
        if forex_selling is None or not forex_selling.text:
            continue
        value = float(forex_selling.text)
        if code == "USD":
            rates["usd"] = value
        elif code == "EUR":
            rates["eur"] = value
        elif code == "CHF":
            rates["chf"] = value

    return rates


def build_tcmb_url(d):
    return f"https://www.tcmb.gov.tr/kurlar/{d.year}{d.month:02d}/{d.day:02d}{d.month:02d}{d.year}.xml"


def fetch_rates_with_fallback(target_date, max_retries=7):
    d = target_date
    for _ in range(max_retries):
        try:
            response = requests.get(
                build_tcmb_url(d),
                timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if response.status_code == 200:
                return parse_tcmb_xml(response.text)
        except requests.RequestException:
            pass
        d = d - timedelta(days=1)
    return None


def fetch_today_rates():
    try:
        response = requests.get(
            "https://www.tcmb.gov.tr/kurlar/today.xml",
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if response.status_code == 200:
            return parse_tcmb_xml(response.text)
    except requests.RequestException:
        pass
    return fetch_rates_with_fallback(datetime.now().date())


def calculate_payload(payload):
    nts_cost = float(payload["nts_cost"])
    margin = float(payload["margin"])
    shipping_cost = float(payload["shipping_cost"])
    usd_rate = float(payload["usd_rate"])
    eur_rate = float(payload["eur_rate"])
    chf_rate = float(payload["chf_rate"])

    shipping_cost_usd = shipping_cost / usd_rate if usd_rate > 0 else 0.0
    base_tl = (nts_cost / margin) + shipping_cost if margin > 0 else 0.0

    result_tl = base_tl
    result_usd = base_tl / usd_rate if usd_rate > 0 else 0.0
    result_eur = base_tl / eur_rate if eur_rate > 0 else 0.0
    result_chf = base_tl / chf_rate if chf_rate > 0 else 0.0

    return {
        "shipping_cost_usd": shipping_cost_usd,
        "result_tl": result_tl,
        "result_usd": result_usd,
        "result_eur": result_eur,
        "result_chf": result_chf,
        "result_tl_ton": result_tl * 1000,
        "result_usd_ton": result_usd * 1000,
        "result_eur_ton": result_eur * 1000,
        "result_chf_ton": result_chf * 1000,
    }


def save_calculation(payload):
    calc_id = str(uuid.uuid4())
    created_at = datetime.now().isoformat()
    results = calculate_payload(payload)

    conn = get_db()
    conn.execute(
        """
        INSERT INTO calculations (
            id, product_name, dealer, dealer_customer, calculation_date,
            usd_rate, eur_rate, chf_rate, factory, shipping_city,
            shipping_cost, shipping_cost_usd, nts_cost, margin,
            result_tl, result_usd, result_eur, result_chf,
            result_tl_ton, result_usd_ton, result_eur_ton, result_chf_ton,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            calc_id,
            payload["product_name"],
            payload["dealer"],
            payload["dealer_customer"],
            payload["calculation_date"],
            float(payload["usd_rate"]),
            float(payload["eur_rate"]),
            float(payload["chf_rate"]),
            payload["factory"],
            payload["shipping_city"],
            float(payload["shipping_cost"]),
            results["shipping_cost_usd"],
            float(payload["nts_cost"]),
            float(payload["margin"]),
            results["result_tl"],
            results["result_usd"],
            results["result_eur"],
            results["result_chf"],
            results["result_tl_ton"],
            results["result_usd_ton"],
            results["result_eur_ton"],
            results["result_chf_ton"],
            created_at,
        ),
    )
    enforce_max_records(conn)
    conn.commit()

    row = conn.execute("SELECT * FROM calculations WHERE id = ?", (calc_id,)).fetchone()
    conn.close()
    return dict(row)


def to_excel_bytes(calculations):
    wb = Workbook()
    ws = wb.active
    ws.title = "Hesaplamalar"

    headers = [
        "Tarih",
        "Urun",
        "Bayi",
        "Bayi Musteri",
        "Fabrika",
        "Nakliye Sehri",
        "Hesaplama Tarihi",
        "USD Kur",
        "EUR Kur",
        "CHF Kur",
        "Nakliye TL/kg",
        "Nakliye USD/kg",
        "NTS Maliyeti",
        "Marj",
        "TL/kg",
        "USD/kg",
        "EUR/kg",
        "CHF/kg",
        "TL/ton",
        "USD/ton",
        "EUR/ton",
        "CHF/ton",
    ]
    ws.append(headers)

    for c in calculations:
        ws.append(
            [
                c.get("created_at", "")[:16].replace("T", " "),
                c.get("product_name", ""),
                c.get("dealer", ""),
                c.get("dealer_customer", ""),
                FACTORIES.get(c.get("factory", ""), c.get("factory", "")),
                c.get("shipping_city", ""),
                c.get("calculation_date", ""),
                c.get("usd_rate", 0),
                c.get("eur_rate", 0),
                c.get("chf_rate", 0),
                c.get("shipping_cost", 0),
                c.get("shipping_cost_usd", 0),
                c.get("nts_cost", 0),
                c.get("margin", 0),
                c.get("result_tl", 0),
                c.get("result_usd", 0),
                c.get("result_eur", 0),
                c.get("result_chf", 0),
                c.get("result_tl_ton", 0),
                c.get("result_usd_ton", 0),
                c.get("result_eur_ton", 0),
                c.get("result_chf_ton", 0),
            ]
        )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def to_csv_bytes(calculations):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "created_at",
            "product_name",
            "dealer",
            "dealer_customer",
            "factory",
            "shipping_city",
            "calculation_date",
            "usd_rate",
            "eur_rate",
            "chf_rate",
            "shipping_cost",
            "shipping_cost_usd",
            "nts_cost",
            "margin",
            "result_tl",
            "result_usd",
            "result_eur",
            "result_chf",
            "result_tl_ton",
            "result_usd_ton",
            "result_eur_ton",
            "result_chf_ton",
        ]
    )
    for c in calculations:
        writer.writerow(
            [
                c.get("id", ""),
                c.get("created_at", ""),
                c.get("product_name", ""),
                c.get("dealer", ""),
                c.get("dealer_customer", ""),
                c.get("factory", ""),
                c.get("shipping_city", ""),
                c.get("calculation_date", ""),
                c.get("usd_rate", 0),
                c.get("eur_rate", 0),
                c.get("chf_rate", 0),
                c.get("shipping_cost", 0),
                c.get("shipping_cost_usd", 0),
                c.get("nts_cost", 0),
                c.get("margin", 0),
                c.get("result_tl", 0),
                c.get("result_usd", 0),
                c.get("result_eur", 0),
                c.get("result_chf", 0),
                c.get("result_tl_ton", 0),
                c.get("result_usd_ton", 0),
                c.get("result_eur_ton", 0),
                c.get("result_chf_ton", 0),
            ]
        )
    return output.getvalue().encode("utf-8")


def render_result_card(calc):
    st.subheader("Hesaplama Sonucu")
    col1, col2 = st.columns(2)
    with col1:
        st.metric("TL / kg", f"{calc['result_tl']:.2f}")
        st.metric("USD / kg", f"{calc['result_usd']:.4f}")
        st.metric("EUR / kg", f"{calc['result_eur']:.4f}")
        st.metric("CHF / kg", f"{calc['result_chf']:.4f}")
    with col2:
        st.metric("TL / ton", f"{calc['result_tl_ton']:.2f}")
        st.metric("USD / ton", f"{calc['result_usd_ton']:.2f}")
        st.metric("EUR / ton", f"{calc['result_eur_ton']:.2f}")
        st.metric("CHF / ton", f"{calc['result_chf_ton']:.2f}")


def main():
    st.set_page_config(page_title="Birim Satis Fiyati Hesaplayici", layout="wide")
    init_db()

    st.title("Birim Satis Fiyati Hesaplayici")
    st.caption("Formul: (NTS Maliyeti / Marj) + Nakliye = TL/kg Birim Fiyat")

    if "rates" not in st.session_state:
        st.session_state.rates = {"usd": 0.0, "eur": 0.0, "chf": 0.0, "date": ""}

    top_left, top_right = st.columns([2, 1])
    with top_left:
        st.write(f"Kayit limiti: **{MAX_RECORDS}**")
    with top_right:
        if st.button("TCMB Kurlarini Getir", use_container_width=True):
            rates = fetch_today_rates()
            if rates:
                st.session_state.rates = rates
                st.success("Kurlar guncellendi.")
            else:
                st.error("Kurlar alinamadi.")

    rates = st.session_state.rates

    with st.form("calc_form"):
        col1, col2, col3 = st.columns(3)
        with col1:
            product_name = st.text_input("Urun Ismi")
            dealer = st.text_input("Bayi")
            dealer_customer = st.text_input("Bayi Musteri")
            factory = st.selectbox("Sevk Fabrikasi", options=list(FACTORIES.keys()), format_func=lambda x: FACTORIES[x])
        with col2:
            calculation_date = st.date_input("Hesaplama Tarihi", value=date.today(), format="DD.MM.YYYY")
            shipping_city = st.text_input("Nakliye Sehri")
            nts_cost = st.number_input("NTS Maliyeti (TL/kg)", min_value=0.0, value=0.0, step=0.01)
            shipping_cost = st.number_input("Nakliye Bedeli (TL/kg)", min_value=0.0, value=0.0, step=0.01)
        with col3:
            margin_pct = st.slider("Hedeflenen Marj (%)", min_value=50, max_value=100, value=70)
            usd_rate = st.number_input("USD Kur", min_value=0.0, value=float(rates.get("usd", 0.0)), step=0.0001, format="%.4f")
            eur_rate = st.number_input("EUR Kur", min_value=0.0, value=float(rates.get("eur", 0.0)), step=0.0001, format="%.4f")
            chf_rate = st.number_input("CHF Kur", min_value=0.0, value=float(rates.get("chf", 0.0)), step=0.0001, format="%.4f")
            if rates.get("date"):
                st.caption(f"TCMB tarih: {rates['date']}")

        submitted = st.form_submit_button("Kaydet ve Hesapla", use_container_width=True)

    if submitted:
        if usd_rate <= 0 or eur_rate <= 0 or chf_rate <= 0:
            st.error("Lutfen tum doviz kurlarini 0'dan buyuk girin.")
        else:
            payload = {
                "product_name": product_name.strip(),
                "dealer": dealer.strip(),
                "dealer_customer": dealer_customer.strip(),
                "calculation_date": calculation_date.strftime("%d-%m-%Y"),
                "usd_rate": usd_rate,
                "eur_rate": eur_rate,
                "chf_rate": chf_rate,
                "factory": factory,
                "shipping_city": shipping_city.strip(),
                "shipping_cost": shipping_cost,
                "nts_cost": nts_cost,
                "margin": margin_pct / 100.0,
            }
            created = save_calculation(payload)
            st.success("Hesaplama kaydedildi.")
            render_result_card(created)

    st.divider()
    st.subheader("Gecmis Hesaplamalar")
    calculations = list_calculations()

    if not calculations:
        st.info("Henuz kayit yok.")
        return

    st.dataframe(
        calculations,
        use_container_width=True,
        hide_index=True,
        column_config={
            "margin": st.column_config.NumberColumn("marj", format="%.2f"),
            "usd_rate": st.column_config.NumberColumn("usd_rate", format="%.4f"),
            "eur_rate": st.column_config.NumberColumn("eur_rate", format="%.4f"),
            "chf_rate": st.column_config.NumberColumn("chf_rate", format="%.4f"),
            "result_tl": st.column_config.NumberColumn("result_tl", format="%.2f"),
            "result_usd": st.column_config.NumberColumn("result_usd", format="%.4f"),
            "result_eur": st.column_config.NumberColumn("result_eur", format="%.4f"),
            "result_chf": st.column_config.NumberColumn("result_chf", format="%.4f"),
        },
    )

    ids = [c["id"] for c in calculations]
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        selected_id = st.selectbox("Silinecek kayit", options=ids)
    with col_b:
        if st.button("Kaydi Sil", type="secondary", use_container_width=True):
            delete_calculation(selected_id)
            st.rerun()
    with col_c:
        st.write("")

    csv_bytes = to_csv_bytes(calculations)
    excel_bytes = to_excel_bytes(calculations)

    dl1, dl2 = st.columns(2)
    with dl1:
        st.download_button(
            "CSV Indir",
            data=csv_bytes,
            file_name=f"hesaplamalar_{datetime.now().strftime('%Y-%m-%d')}.csv",
            mime="text/csv",
            use_container_width=True,
        )
    with dl2:
        st.download_button(
            "Excel Indir",
            data=excel_bytes,
            file_name=f"hesaplamalar_{datetime.now().strftime('%Y-%m-%d')}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )


if __name__ == "__main__":
    main()
