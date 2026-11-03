from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables"
OUT.mkdir(exist_ok=True)
DOCX = OUT / "CSR_Dashboard_AI_API_Cost_Analysis.docx"
CHART = OUT / "ai_api_cost_comparison.png"

PURPLE = "7F3F98"
TEAL = "00A88F"
NAVY = "24344D"
PALE = "F5F1F8"
PALE_TEAL = "EAF8F5"
GRID = "D9D9D9"
TEXT = "24344D"
MUTED = "5C6F8A"
WHITE = "FFFFFF"

USD_INR = 95.0
INPUT_TOKENS = 3000
OUTPUT_TOKENS = 300

MODELS = [
    ("OpenAI GPT 5.6 Luna", 0.20, 1.20, "Recommended for production cost control"),
    ("Google Gemini 3.1 Flash Lite", 0.25, 1.50, "Low cost but requires a new provider adapter"),
    ("Anthropic Claude Sonnet 5.5", 2.00, 10.00, "Strong quality and already supported"),
    ("OpenAI GPT 5.6 Terra", 2.00, 12.00, "Higher reasoning quality than needed for routine Q and A"),
]


def cost_per_call(inp, out):
    return INPUT_TOKENS / 1_000_000 * inp + OUTPUT_TOKENS / 1_000_000 * out


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=120, start=120, bottom=120, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=GRID, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:color"), color)


def set_repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_keep_with_next(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    p_pr.append(OxmlElement("w:keepNext"))


def font_run(run, size=9.5, bold=False, color=TEXT):
    run.font.name = "Aptos"
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), "Aptos")
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), "Aptos")
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def add_hyperlink(paragraph, text, url):
    part = paragraph.part
    r_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)
    new_run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), PURPLE)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.extend([color, underline])
    new_run.append(r_pr)
    text_node = OxmlElement("w:t")
    text_node.text = text
    new_run.append(text_node)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)


def add_para(doc, text="", style=None, bold_lead=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.12
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        font_run(r, 10, True)
        r = p.add_run(text[len(bold_lead):])
        font_run(r, 10)
    else:
        r = p.add_run(text)
        font_run(r, 10)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.first_line_indent = Inches(-0.16)
        font_run(p.add_run(item), 9.5)


def add_table(doc, headers, rows, widths=None, numeric_cols=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    hdr = table.rows[0]
    set_repeat_header(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        set_cell_shading(c, NAVY)
        set_cell_margins(c)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if widths:
            c.width = Inches(widths[i])
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        font_run(p.add_run(h), 8.5, True, WHITE)
    for ri, row in enumerate(rows):
        cells = table.add_row().cells
        for i, val in enumerate(row):
            c = cells[i]
            set_cell_margins(c)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if widths:
                c.width = Inches(widths[i])
            if ri % 2:
                set_cell_shading(c, "F5F7FA")
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if numeric_cols and i in numeric_cols else WD_ALIGN_PARAGRAPH.LEFT
            font_run(p.add_run(str(val)), 8.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def build_chart():
    labels = [m[0].replace("OpenAI ", "").replace("Google ", "").replace("Anthropic ", "") for m in MODELS]
    costs = [cost_per_call(m[1], m[2]) * 1000 * USD_INR for m in MODELS]
    width, height = 1500, 560
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    font_path = r"C:\Windows\Fonts\arial.ttf"
    bold_path = r"C:\Windows\Fonts\arialbd.ttf"
    font = ImageFont.truetype(font_path, 27)
    small = ImageFont.truetype(font_path, 23)
    bold = ImageFont.truetype(bold_path, 28)
    left, right, top = 410, 1400, 70
    max_cost = max(costs)
    colors = ["#00A88F", "#49BDA9", "#7F3F98", "#A46BB6"]
    draw.text((left, 15), "Estimated cost per 1,000 cloud model calls in INR", fill="#24344D", font=bold)
    for tick in range(0, 1001, 200):
        x = left + int((right-left) * tick / 1000)
        draw.line((x, top, x, height-55), fill="#E2E6EB", width=2)
        draw.text((x-18, height-45), str(tick), fill="#5C6F8A", font=small)
    for i, (label, value, color) in enumerate(zip(labels, costs, colors)):
        y = top + i * 108
        draw.text((20, y+16), label, fill="#24344D", font=font)
        bar_end = left + int((right-left) * value / 1000)
        draw.rounded_rectangle((left, y, bar_end, y+60), radius=12, fill=color)
        draw.text((bar_end+15, y+14), f"INR {value:,.0f}", fill="#24344D", font=bold)
    image.save(CHART)


def main():
    build_chart()
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(0.65)
    sec.bottom_margin = Inches(0.65)
    sec.left_margin = Inches(0.72)
    sec.right_margin = Inches(0.72)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(10)
    normal.font.color.rgb = RGBColor.from_string(TEXT)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.12
    title = styles["Title"]
    title.font.name = "Aptos Display"
    title.font.size = Pt(27)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_after = Pt(8)
    title_ppr = title.element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)
    for name, size in (("Heading 1", 16), ("Heading 2", 12)):
        st = styles[name]
        st.font.name = "Aptos Display"
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = RGBColor(0, 0, 0)
        st.paragraph_format.space_before = Pt(12 if name == "Heading 1" else 8)
        st.paragraph_format.space_after = Pt(5)
        st.paragraph_format.keep_with_next = True
    if "Small Note" not in styles:
        st = styles.add_style("Small Note", WD_STYLE_TYPE.PARAGRAPH)
        st.font.name = "Aptos"
        st.font.size = Pt(8)
        st.font.color.rgb = RGBColor.from_string(MUTED)

    # Header branding
    header = sec.header
    ht = header.add_table(rows=1, cols=2, width=Inches(6.9))
    ht.columns[0].width = Inches(1.15)
    ht.columns[1].width = Inches(5.75)
    ht.cell(0, 0).text = "CMS"
    ht.cell(0, 1).text = "CSR INTELLIGENCE"
    set_repeat_header(ht.rows[0])
    for i, c in enumerate(ht.rows[0].cells):
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            font_run(r, 15 if i == 0 else 8.5, True, PURPLE if i == 0 else MUTED)
    # remove initial empty header paragraph spacing
    header.paragraphs[0].paragraph_format.space_after = Pt(0)

    p = doc.add_paragraph(style="Title")
    p.add_run("AI API Cost Analysis for the CSR Dashboard")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(16)
    font_run(p.add_run("Question analysis and natural language search agent"), 13, False, MUTED)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(18)
    font_run(p.add_run("Prepared for management review  |  26 October 2026"), 9, True, PURPLE)

    add_para(doc, "This report estimates the cost of adding a cloud language model API to the AI Analysis section of the CSR dashboard. The current dashboard already answers supported data questions locally and without an API. A paid model is needed only for broader questions that the built-in parser cannot interpret. This hybrid design should be retained because it gives grounded answers and keeps recurring API spend very low.")
    add_para(doc, "Recommendation: use OpenAI GPT 5.6 Luna as the first production model, keep the deterministic query engine as the first route, and apply a monthly API budget cap. At the expected usage level in this report, model charges are approximately INR 68 per month before tax. If the current Render service has enough capacity, no additional hosting service is required.", bold_lead="Recommendation:")

    doc.add_heading("Executive Decision", level=1)
    add_table(doc,
              ["Decision item", "Recommended choice", "Reason"],
              [
                  ["Architecture", "Local query engine first, cloud model only as fallback", "Preserves accuracy and avoids paying for routine questions"],
                  ["Initial provider", "OpenAI API with GPT 5.6 Luna", "Already supported in the code and lowest listed cost among directly compatible choices"],
                  ["Expected model budget", "INR 100 to INR 500 per month", "Includes headroom above the expected INR 68 usage estimate"],
                  ["External web search", "Do not enable in phase one", "The agent answers from the dashboard dataset; live web results add cost and evidence risk"],
                  ["Vector database", "Not required", "The dashboard sends a structured fact pack, not a document library"],
              ], [1.25, 2.2, 3.45])

    doc.add_page_break()
    doc.add_heading("Current Dashboard Architecture", level=1)
    add_para(doc, "The existing implementation is already designed as a grounded analytics assistant rather than a general chatbot. The request first goes to the built-in natural-language query engine. If that engine understands the question, it calculates the answer directly from the CSR fact table. Only an unsupported question is passed to the configured cloud model.")
    add_table(doc,
              ["Stage", "What happens", "API cost"],
              [
                  ["1 User question", "The user asks about companies, years, states, sectors, domains, trends, compliance or CSR amounts.", "None"],
                  ["2 Deterministic analysis", "The local parser identifies known entities and metrics, then computes the answer from dashboard data.", "None"],
                  ["3 Cloud fallback", "If the parser cannot understand the question, a compact pre-calculated fact pack is sent to the model.", "Token based"],
                  ["4 Grounded response", "The system prompt requires the model to use only supplied figures and state when information is unavailable.", "Included in model call"],
              ], [1.25, 4.15, 1.5])
    add_para(doc, "No customer report PDF, workbook or full raw database needs to be uploaded to the model in the present design. The model receives a compact JSON summary containing KPIs, trends, forecasts, leading companies, states, sectors, thematic areas, implementation modes, anomalies and data caveats.")

    doc.add_heading("What the API Is Needed For", level=1)
    add_bullets(doc, [
        "Interpret questions that fall outside the built-in parser's supported patterns.",
        "Turn the supplied fact pack into a concise management explanation.",
        "Explain changes, risks and gaps in natural language without recalculating dashboard figures.",
        "Optionally generate a short executive briefing when a user explicitly requests narration.",
    ])
    add_para(doc, "The API is not required for filtering, dashboard calculations, charts, forecasting, report generation or the supported question patterns. Those functions remain available when the API key is absent.")

    doc.add_page_break()
    doc.add_heading("Cost Formula and Assumptions", level=1)
    add_para(doc, "Monthly model cost equals input tokens divided by one million multiplied by the input rate, plus output tokens divided by one million multiplied by the output rate, multiplied by the number of cloud-model calls.")
    add_table(doc,
              ["Assumption", "Planning value", "Basis"],
              [
                  ["Input per cloud call", "3,000 tokens", "System instructions, question and compact fact pack"],
                  ["Output per cloud call", "300 tokens", "A concise dashboard answer"],
                  ["Questions answered locally", "75 percent", "Planning assumption; measure after launch"],
                  ["Questions sent to the model", "25 percent", "Fallback-only architecture"],
                  ["Currency conversion", "USD 1 = INR 95", "Rounded planning rate near 26 October 2026; invoices vary"],
              ], [2.0, 1.6, 3.3])

    doc.add_heading("Cloud Model Price Comparison", level=1)
    rows = []
    for name, inp, out, note in MODELS:
        per_1000 = cost_per_call(inp, out) * 1000
        rows.append([name, f"USD {inp:.2f}", f"USD {out:.2f}", f"USD {per_1000:.2f}", f"INR {per_1000*USD_INR:,.0f}", note])
    add_table(doc,
              ["Model", "Input per 1M", "Output per 1M", "Per 1,000 calls", "Approx INR", "Assessment"],
              rows, [1.45, 0.8, 0.85, 0.9, 0.8, 2.1], numeric_cols={1,2,3,4})
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(CHART), width=Inches(6.8))
    doc.inline_shapes[-1]._inline.docPr.set(
        "descr",
        "Bar chart comparing the estimated INR cost per 1,000 cloud model calls for four API models",
    )
    p.paragraph_format.space_after = Pt(2)
    cap = doc.add_paragraph("Figure 1  Estimated provider cost for 1,000 cloud model calls")
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.style = "Small Note"
    add_para(doc, "Price is not the only criterion. The selected model must follow the supplied facts, return concise answers, work reliably at the required latency, and support the organization's data-governance requirements. A short benchmark using 30 to 50 real dashboard questions should precede production approval.")

    doc.add_heading("Monthly Usage Scenarios", level=1)
    scenarios = [
        ("Pilot", 100, 5, 0.20),
        ("Expected internal use", 300, 10, 0.25),
        ("High adoption", 1000, 20, 0.30),
    ]
    rows = []
    luna_call = cost_per_call(0.20, 1.20)
    for name, users, questions, fallback in scenarios:
        total_q = users * questions
        calls = round(total_q * fallback)
        usd = calls * luna_call
        rows.append([name, f"{users:,}", f"{questions}", f"{fallback:.0%}", f"{calls:,}", f"USD {usd:.2f}", f"INR {usd*USD_INR:,.0f}"])
    add_table(doc,
              ["Scenario", "Users", "Questions per user", "Cloud fallback", "Model calls", "Model cost", "Approx INR"],
              rows, [1.3, 0.65, 1.1, 0.9, 0.8, 0.9, 0.9], numeric_cols={1,2,3,4,5,6})
    add_para(doc, "Even if every question in the expected scenario went to GPT 5.6 Luna, 3,000 calls would cost about USD 2.88 or INR 274 under these assumptions. The hybrid route is still recommended because it improves auditability and protects the system from unnecessary model dependence.")

    doc.add_heading("Additional and Indirect Costs", level=1)
    add_table(doc,
              ["Cost item", "When it applies", "Indicative impact"],
              [
                  ["Render hosting", "Only if the current service needs a paid compute plan", "Free plan may be usable for testing; entry paid compute is approximately USD 6 per month"],
                  ["Taxes and payment charges", "Foreign SaaS billing to an Indian entity", "Allow for applicable GST, bank or card foreign exchange markup and invoice conversion differences"],
                  ["Web search", "Only if the agent must retrieve external internet evidence", "OpenAI lists USD 10 per 1,000 web search calls plus model tokens"],
                  ["File search or vector storage", "Only if the agent must search a growing report library", "Not needed for the present structured dashboard fact pack"],
                  ["Monitoring", "Recommended in production", "Usage logging can begin in the existing application; a paid monitoring service is optional"],
                  ["Engineering", "One-time implementation and testing", "Provider configuration is small; benchmarking, guardrails, usage limits and QA require the main effort"],
                  ["Support and maintenance", "Ongoing", "Review model deprecations, prices, failed requests and answer quality quarterly"],
              ], [1.65, 2.25, 3.0])

    doc.add_heading("Hosting Cost View", level=1)
    add_para(doc, "If the CSR dashboard is already running on Render and has available memory and request capacity, adding outbound API calls does not require another server. The incremental hosting cost can therefore be zero. If a paid entry compute plan is required, budget approximately USD 6 or INR 570 per month before taxes, using the same planning exchange rate.")
    add_table(doc,
              ["Expected monthly component", "Estimated amount"],
              [
                  ["GPT 5.6 Luna model usage", "INR 68"],
                  ["Render paid entry compute if required", "INR 570"],
                  ["Subtotal before tax and payment charges", "INR 638"],
                  ["If existing hosting has capacity", "Incremental subtotal approximately INR 68"],
              ], [4.8, 2.1], numeric_cols={1})

    doc.add_page_break()
    doc.add_heading("Provider Recommendation", level=1)
    add_para(doc, "Preferred production option: OpenAI GPT 5.6 Luna. It fits the dashboard's bounded question-answering task, has the lowest listed token cost in this comparison, and the application already contains an OpenAI provider route. The integration should be updated to the current OpenAI Responses API and the model should be pinned in configuration rather than hard-coded.", bold_lead="Preferred production option:")
    add_para(doc, "Alternative: Anthropic Claude Sonnet 5.5. The current code already supports Anthropic and the quality is suitable, but the estimated recurring model cost is about nine to ten times the Luna estimate for this workload. The absolute cost is still modest at expected usage.", bold_lead="Alternative:")
    add_para(doc, "Budget alternative requiring development: Gemini 3.1 Flash Lite. Its list price is close to Luna, but the present application has no Gemini provider adapter. Use the paid service for business data; Google's unpaid service terms permit submitted content to be used for product improvement.", bold_lead="Budget alternative requiring development:")

    doc.add_heading("Security and Governance Requirements", level=1)
    add_bullets(doc, [
        "Store the provider key only as a Render environment secret. Never expose it in browser code, GitHub, logs or exported reports.",
        "Keep all provider calls on the server-side API route and require an authenticated dashboard session.",
        "Apply per-user and per-IP rate limits, a maximum question length, request timeouts and a monthly spending cap.",
        "Send only the minimum fact pack needed to answer the question; do not send email addresses, passwords or personal user data.",
        "Record usage metadata such as timestamp, user ID, selected filters, provider, model, input tokens, output tokens, latency and result status. Avoid retaining full prompts unless approved.",
        "Show the answer source in the interface: built-in calculation or cloud model. Keep evidence figures visible for review.",
        "Do not allow the model to execute database queries or arbitrary code. Calculations should remain in the deterministic dashboard layer.",
        "Review provider data retention and data residency requirements with the organization's legal and information-security teams before launch.",
    ])
    add_para(doc, "OpenAI states that API data is not used for model training by default. Standard abuse-monitoring logs may be retained for up to 30 days, with additional controls available to qualifying organizations. Paid Gemini services state that prompts and responses are not used to improve Google products, while unpaid services have different data-use terms.")

    doc.add_page_break()
    doc.add_heading("Implementation Plan", level=1)
    add_table(doc,
              ["Phase", "Work", "Acceptance criterion"],
              [
                  ["1 Configure", "Create a provider project, restricted API key, spending limit and Render environment variables.", "No secret appears in the repository or browser network payload"],
                  ["2 Modernize", "Use the current provider endpoint, pin the model and capture token usage returned by the API.", "A test question returns a grounded response and usage record"],
                  ["3 Protect", "Add authentication enforcement, rate limits, timeout handling and friendly failure messages.", "Abuse and provider outages do not affect dashboard calculations"],
                  ["4 Benchmark", "Run 30 to 50 representative CSR questions against deterministic answers and expert review.", "Accuracy and refusal behavior meet the agreed threshold"],
                  ["5 Pilot", "Release to a small user group and measure fallback rate, cost, latency and unanswered questions.", "Actual monthly cost is within the approved cap"],
                  ["6 Review", "Review provider pricing, model lifecycle and answer quality every quarter.", "No deprecated model or uncontrolled spend remains"],
              ], [1.0, 3.25, 2.7])

    doc.add_heading("Recommended Approval", level=1)
    add_para(doc, "Approve a four-week pilot with a monthly model budget cap of INR 500 and no external web search. Use the current local engine for supported questions and GPT 5.6 Luna only for fallback questions. Continue on the existing Render service unless monitoring shows a capacity constraint. At the end of the pilot, replace assumptions with measured token usage, fallback rate, answer quality and user volume before setting the production budget.")

    doc.add_heading("Sources and Pricing Date", level=1)
    add_para(doc, "Pricing and policy references were checked on 26 October 2026. Provider prices can change; confirm the current rate before procurement.")
    sources = [
        ("OpenAI API model pricing and GPT 5.6 Luna", "https://developers.openai.com/api/docs/models"),
        ("OpenAI API tool pricing", "https://developers.openai.com/api/docs/pricing"),
        ("OpenAI API data controls", "https://developers.openai.com/api/docs/guides/your-data"),
        ("Anthropic Claude pricing", "https://www.anthropic.com/pricing"),
        ("Google Gemini API pricing", "https://ai.google.dev/gemini-api/docs/pricing"),
        ("Google Gemini API terms", "https://ai.google.dev/gemini-api/terms"),
        ("Render pricing", "https://render.com/pricing"),
    ]
    for label, url in sources:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        add_hyperlink(p, label, url)

    # Footer
    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font_run(fp.add_run("CMS CSR Intelligence  |  AI API Cost Analysis"), 8, False, MUTED)

    # Prevent table rows from splitting where practical
    for table in doc.tables:
        for row in table.rows:
            tr_pr = row._tr.get_or_add_trPr()
            cant_split = OxmlElement("w:cantSplit")
            tr_pr.append(cant_split)

    doc.core_properties.title = "AI API Cost Analysis for the CSR Dashboard"
    doc.core_properties.subject = "Cost and implementation analysis for the AI question analysis and search agent"
    doc.core_properties.author = "CMS"
    doc.save(DOCX)
    print(DOCX)


if __name__ == "__main__":
    main()
