export const DEMO_REPORT = {
  patient: {
    name: "John Doe",
    age: 42,
    gender: "Male",
    date: "June 25, 2026",
    id: "PT-88392-A"
  },
  categories: [
    {
      id: "cbc",
      name: "Complete Blood Count (CBC)",
      description: "Evaluates your overall health and detects a wide range of disorders, including anemia and infection.",
      metrics: [
        { name: "Hemoglobin", value: 11.2, unit: "g/dL", minRef: 13.8, maxRef: 17.2, status: "low", explanation: "Low hemoglobin indicates mild anemia — tissues receive less oxygen, causing fatigue." },
        { name: "Red Blood Cell (RBC)", value: 3.9, unit: "x10^6/uL", minRef: 4.5, maxRef: 5.9, status: "low", explanation: "Low RBC count contributes to reduced oxygen-carrying capacity and supports anemia findings." },
        { name: "White Blood Cell (WBC)", value: 6.8, unit: "x10^3/uL", minRef: 4.5, maxRef: 11.0, status: "normal", explanation: "Normal WBC count — no active bacterial infection signals from the immune system." },
        { name: "Platelet Count", value: 135, unit: "x10^3/uL", minRef: 150, maxRef: 450, status: "low", explanation: "Mildly low platelets (thrombocytopenia) — blood clotting may be slightly slower." },
        { name: "Hematocrit", value: 35.1, unit: "%", minRef: 41.5, maxRef: 50.4, status: "low", explanation: "Low hematocrit is consistent with low hemoglobin findings and indicates mild anemia." }
      ]
    },
    {
      id: "lft",
      name: "Liver Function Test (LFT)",
      description: "Measures liver enzyme, protein, and bilirubin levels to check liver health.",
      metrics: [
        { name: "SGPT (ALT)", value: 78, unit: "U/L", minRef: 7, maxRef: 56, status: "high", explanation: "Elevated ALT indicates liver cell stress or mild inflammation." },
        { name: "SGOT (AST)", value: 65, unit: "U/L", minRef: 10, maxRef: 40, status: "high", explanation: "Elevated AST alongside ALT strongly points to a liver-origin issue." },
        { name: "Total Bilirubin", value: 1.8, unit: "mg/dL", minRef: 0.2, maxRef: 1.2, status: "high", explanation: "Elevated bilirubin may cause mild jaundice and indicates reduced liver processing speed." },
        { name: "Alkaline Phosphatase (ALP)", value: 92, unit: "U/L", minRef: 44, maxRef: 147, status: "normal", explanation: "Normal ALP — bile duct flow appears unobstructed." },
        { name: "Albumin", value: 4.2, unit: "g/dL", minRef: 3.5, maxRef: 5.0, status: "normal", explanation: "Normal albumin shows the liver's protein synthesis capacity is intact." }
      ]
    },
    {
      id: "kft",
      name: "Kidney Function Test (KFT)",
      description: "Evaluates how well the kidneys are filtering waste products from the blood.",
      metrics: [
        { name: "Serum Creatinine", value: 1.1, unit: "mg/dL", minRef: 0.74, maxRef: 1.35, status: "normal", explanation: "Normal creatinine — kidneys are filtering muscle waste effectively." },
        { name: "Blood Urea Nitrogen (BUN)", value: 22, unit: "mg/dL", minRef: 7, maxRef: 20, status: "high", explanation: "Mildly elevated BUN may indicate slight dehydration or elevated protein intake." },
        { name: "Uric Acid", value: 7.8, unit: "mg/dL", minRef: 3.5, maxRef: 7.2, status: "high", explanation: "High uric acid increases the risk of gout attacks and kidney stones." },
        { name: "eGFR", value: 78, unit: "mL/min/1.73m²", minRef: 60, maxRef: 120, status: "normal", explanation: "Normal eGFR indicates adequate kidney filtration capacity." },
        { name: "Sodium (Na+)", value: 138, unit: "mEq/L", minRef: 136, maxRef: 145, status: "normal", explanation: "Normal sodium — fluid balance and nerve function are well regulated." },
        { name: "Potassium (K+)", value: 4.1, unit: "mEq/L", minRef: 3.5, maxRef: 5.0, status: "normal", explanation: "Normal potassium — heart and muscle electrolyte levels are balanced." }
      ]
    },
    {
      id: "thyroid",
      name: "Thyroid Profile",
      description: "Assesses thyroid gland function which controls metabolism, energy, and vital body processes.",
      metrics: [
        { name: "TSH", value: 6.2, unit: "mIU/L", minRef: 0.4, maxRef: 4.0, status: "high", explanation: "High TSH suggests the thyroid is underactive (hypothyroidism) — the pituitary is over-signalling to compensate." },
        { name: "Free T4", value: 0.72, unit: "ng/dL", minRef: 0.8, maxRef: 1.8, status: "low", explanation: "Low Free T4 confirms the thyroid is not producing sufficient hormone — consistent with hypothyroidism." },
        { name: "Free T3", value: 2.5, unit: "pg/mL", minRef: 2.3, maxRef: 4.2, status: "normal", explanation: "Free T3 is at the lower end of normal — active thyroid hormone conversion is mildly reduced." }
      ]
    },
    {
      id: "lipid",
      name: "Lipid Profile",
      description: "Measures cholesterol and triglycerides to assess cardiovascular disease risk.",
      metrics: [
        { name: "Total Cholesterol", value: 218, unit: "mg/dL", minRef: 0, maxRef: 200, status: "high", explanation: "Borderline high cholesterol raises long-term cardiovascular risk." },
        { name: "LDL Cholesterol", value: 142, unit: "mg/dL", minRef: 0, maxRef: 100, status: "high", explanation: "High LDL ('bad' cholesterol) promotes arterial plaque and increases heart attack risk." },
        { name: "HDL Cholesterol", value: 38, unit: "mg/dL", minRef: 40, maxRef: 60, status: "low", explanation: "Low HDL ('good' cholesterol) reduces protection against arterial plaque buildup." },
        { name: "Triglycerides", value: 195, unit: "mg/dL", minRef: 0, maxRef: 150, status: "high", explanation: "High triglycerides are associated with metabolic syndrome and increased cardiovascular risk." }
      ]
    }
  ]
};

export const MOCK_CONVERSATION = [
  {
    id: 1,
    sender: "bot",
    text: "Hello! I am **PathoInsight** — your AI pathology assistant.\n\nUpload a pathology report PDF/image, or click **'Use Demo Report'** to load a sample case with CBC, LFT, KFT, Thyroid, and Lipid panels.",
    timestamp: "16:20",
    citations: []
  }
];

export const SUGGESTED_QUESTIONS = [
  "Explain my elevated liver enzymes (ALT/AST)",
  "What does a low hemoglobin count mean?",
  "What causes high TSH and low T4?",
  "How can I lower my LDL cholesterol?",
  "What does high uric acid mean for me?",
  "When should I follow up with a doctor?"
];
