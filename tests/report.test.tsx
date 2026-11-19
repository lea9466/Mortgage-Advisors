import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BankReport } from "@/components/cases/report/BankReport";
import type { BankReport as BankReportData, ReportBorrower } from "@/lib/cases/report";

const borrower = (id: string, first: string, spouse: string | null, idNumber: string): ReportBorrower => ({
  id,
  first_name: first,
  last_name: "שטרן",
  id_number_last4: idNumber.slice(-4),
  birth_date: "1992-05-14",
  phone: "0520001111",
  phone_receives_sms: true,
  marital_status: "married",
  spouse_id: spouse,
  city: "ביתר עילית",
  street: "הדוגמה",
  house_number: "12",
  idNumber,
});

const A = "6f1c2c1e-6a0e-4d6e-9f7c-2b6d2f1a9e11";
const B = "7a2d3d2f-7b1f-4e7f-8a8d-3c7e3a2b0f22";
const yaakov = borrower(A, "יעקב", B, "123456782");
const rivka = borrower(B, "רבקה", A, "000000018");

const report: BankReportData = {
  record: {
    id: "8b3e4e3a-8c2a-4f8a-9b9e-4d8f4b3c1a33",
    case_year: 2026,
    case_seq: 14,
    purpose: "purchase",
    stage: "collecting_documents",
    requested_amount: 1150000,
    property_value: null,
    contract_price: 1780000,
    equity: 630000,
    hand: "second",
    apartment_class: "single",
    updated_at: "2026-11-20T10:00:00Z",
    case_borrowers: [
      { position: 0, clients: yaakov },
      { position: 1, clients: rivka },
    ],
  },
  // One family: both spouses, children counted once.
  families: [{ members: [yaakov, rivka], childBirthYears: [2025, 2023, 2020] }],
  incomes: [
    { id: "1", client_id: A, kind: "employee", title: "מוסדות חינוך", job_title: "מלמד", seniority_months: 75, monthly_amount: 14200 },
    { id: "2", client_id: B, kind: "kollel", title: "כולל דוגמה", job_title: null, seniority_months: null, monthly_amount: 3800 },
    { id: "3", client_id: B, kind: "allowance", title: "קצבת ילדים", job_title: null, seniority_months: null, monthly_amount: 1050 },
  ],
  liabilities: [{ id: "4", client_id: A, kind: "gemach", lender: "גמ\"ח דוגמה", balance: 40000, monthly_payment: 800, remaining_months: 50 }],
};

describe("bank report", () => {
  const html = renderToStaticMarkup(
    <BankReport report={report} organizationName="המשרד לבדיקה" producedAt={new Date("2026-11-20T10:00:00Z")} />,
  );

  it("shows both borrowers with their full ID numbers", () => {
    expect(html).toContain("יעקב שטרן");
    expect(html).toContain("רבקה שטרן");
    expect(html).toContain("123456782");
    expect(html).toContain("000000018");
  });

  it("prints the children once for a couple", () => {
    expect(html.match(/ילדים \(משותף לבני הזוג\)/g)).toHaveLength(1);
    expect(html).toContain("ילדים (משותף לבני הזוג): 3, מהם 3 מתחת לגיל 18");
  });

  it("totals incomes per borrower and for all borrowers", () => {
    expect(html).toContain("₪14,200");
    expect(html).toContain("₪4,850"); // Rivka: 3,800 + 1,050
    expect(html).toContain("₪19,050"); // everyone
  });

  it("shows the deal and the liabilities", () => {
    expect(html).toContain("₪1,780,000"); // contract price as the property value
    expect(html).toContain("65%"); // 1,150,000 / 1,780,000
    expect(html).toContain("₪800");
    expect(html).toContain("2026-014");
  });
});
