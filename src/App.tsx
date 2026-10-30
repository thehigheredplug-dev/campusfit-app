import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

type AnswerValue = string | number | string[];
type Answers = Record<string, AnswerValue>;
type AuthProvider = "Google" | "Email";
type ResultsTab = "colleges" | "scholarships" | "saved";
type AdVariant = "leaderboard" | "sidebar";
type PlanTier = "free" | "pro";

type AuthUser = {
  name: string;
  email: string;
  provider: AuthProvider;
};

type Question =
  | {
      key: string;
      label: string;
      type: "slider";
      min: number;
      max: number;
      step: number;
      format: (value: number) => string;
      hint?: string;
    }
  | {
      key: string;
      label: string;
      type: "select" | "multiselect";
      options: string[];
      hint?: string;
      note?: {
        before: string;
        emphasis: string;
        after?: string;
      };
    };

type Section = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  questions: Question[];
};

type College = {
  id: number;
  name: string;
  city: string;
  state: string;
  ownership: "Public" | "Private nonprofit";
  hbcu: boolean;
  admitRate: number;
  gradRate: number;
  retentionRate: number;
  enrollment: number;
  netPrice: number;
  earnings: number;
  admissionsUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
};

type ScoredCollege = College & {
  fit: {
    total: number;
    affordability: number;
    studentSuccess: number;
    outcomes: number;
    admissions: number;
    size: number;
    effectiveCost: number;
  };
};

type Scholarship = {
  id: string;
  title: string;
  provider: string;
  amount_min?: number;
  amount_max?: number;
  deadline?: string;
  fit_score: number;
  why: string;
  source_url?: string;
  application_url?: string;
  eligibility_json: {
    majors?: string[];
    tags?: string[];
    state_restrictions?: string[];
    gpa_min?: number;
  };
};

type ScholarshipSearchSource = {
  name: string;
  url: string;
  description: string;
};

type ScholarshipFilters = {
  deadline_before: string;
  min_amount: string;
  min_fit: string;
};

type BillingStatus = {
  plan: PlanTier;
  subscription_status: string;
  current_period_end?: number | null;
  billing_configured: boolean;
  features: string[];
};

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || "http://localhost:8000";
const PRO_PRICE_LABEL = import.meta.env.VITE_PRO_PRICE_LABEL || "Subscription pricing shown at checkout";
const AUTH_STORAGE_KEY = "campusfit.authUser";
const FREE_COLLEGE_LIMIT = 5;
const FREE_SCHOLARSHIP_LIMIT = 3;
const GOOGLE_FORM_ACTION_URL = import.meta.env.VITE_GOOGLE_FORM_ACTION_URL || "";
const GOOGLE_FORM_FIELDS = {
  name: import.meta.env.VITE_GOOGLE_FORM_NAME_ENTRY || "",
  email: import.meta.env.VITE_GOOGLE_FORM_EMAIL_ENTRY || "",
  provider: import.meta.env.VITE_GOOGLE_FORM_PROVIDER_ENTRY || "",
  timestamp: import.meta.env.VITE_GOOGLE_FORM_TIMESTAMP_ENTRY || "",
};
const DISPLAY_AD_CONFIG = {
  sponsorName: import.meta.env.VITE_AD_SPONSOR_NAME || "CampusFit Partner",
  headline: import.meta.env.VITE_AD_HEADLINE || "College tools, funding help, and student success offers.",
  body:
    import.meta.env.VITE_AD_BODY ||
    "A responsive sponsored placement for paid ads, affiliate offers, and student-centered partner campaigns.",
  cta: import.meta.env.VITE_AD_CTA || "Explore Partner Offer",
  url: import.meta.env.VITE_AD_URL || "",
  slotId: import.meta.env.VITE_AD_SLOT_ID || "campusfit-responsive-display",
  affiliateId: import.meta.env.VITE_AD_AFFILIATE_ID || "",
};

const PRO_FEATURES = [
  { label: "Unlimited college matches", status: "available" },
  { label: "Full scholarship results", status: "available" },
  { label: "Advanced scholarship filters", status: "available" },
  { label: "Saved college and scholarship lists", status: "available" },
  { label: "Exportable match report", status: "available" },
  { label: "Deadline reminders", status: "available" },
  { label: "Counselor or advisor sharing", status: "available" },
  { label: "Premium THEP + DTR recommendations", status: "available" },
  { label: "AI profile or essay review", status: "coming" },
  { label: "Family or counselor dashboard", status: "coming" },
  { label: "DTR Uncle J Chatbot", status: "available" },
] as const;

const SCHOLARSHIP_SEARCH_SOURCES: ScholarshipSearchSource[] = [
  {
    name: "Fastweb",
    url: "https://www.fastweb.com",
    description: "Large scholarship search engine with scholarships, internships, and college financial aid resources.",
  },
  {
    name: "Scholarships.com",
    url: "https://www.scholarships.com",
    description: "Comprehensive scholarship search tool based on academic profile, interests, and background.",
  },
  {
    name: "Cappex",
    url: "https://www.cappex.com",
    description: "Scholarship database with college matching and admissions tools.",
  },
  {
    name: "Chegg Scholarships",
    url: "https://www.chegg.com/scholarships",
    description: "Scholarship search engine with funding opportunities based on qualifications and interests.",
  },
  {
    name: "Peterson's Scholarship Search",
    url: "https://www.petersons.com/scholarship-search",
    description: "College and scholarship resource with funding and admissions information.",
  },
  {
    name: "Niche Scholarships",
    url: "https://www.niche.com/colleges/scholarships",
    description: "Scholarship platform with no-essay and demographics-based awards.",
  },
  {
    name: "College Board Scholarship Search",
    url: "https://bigfuture.collegeboard.org/scholarship-search",
    description: "Free College Board tool for scholarships, internships, and grants.",
  },
  {
    name: "Unigo",
    url: "https://www.unigo.com/scholarships",
    description: "Scholarship database with contests and opportunities for many student levels.",
  },
  {
    name: "ScholarshipOwl",
    url: "https://www.scholarshipowl.com",
    description: "Scholarship matching and application service.",
  },
  {
    name: "Scholly",
    url: "https://www.myscholly.com",
    description: "Scholarship app matching students with funding opportunities.",
  },
  {
    name: "CollegeNet",
    url: "https://www.collegenet.com/elect/app/app",
    description: "Scholarship platform with discussion and voting contests.",
  },
  {
    name: "ScholarshipMonkey",
    url: "https://www.scholarshipmonkey.com",
    description: "Scholarship search engine for academic and personal background matches.",
  },
  {
    name: "SuperCollege",
    url: "https://www.supercollege.com",
    description: "Scholarship listings, admission advice, and financial aid tips.",
  },
  {
    name: "International Scholarships",
    url: "https://www.internationalscholarships.com",
    description: "Scholarships for international students and study abroad.",
  },
  {
    name: "Sallie Mae Scholarship Search",
    url: "https://www.salliemae.com/funding-college/scholarships",
    description: "Sallie Mae scholarship database for college funding opportunities.",
  },
  {
    name: "CareerOneStop Scholarship Finder",
    url: "https://www.careeronestop.org/toolkit/training/find-scholarships.aspx",
    description: "U.S. Department of Labor-sponsored scholarship, grant, and financial aid finder.",
  },
  {
    name: "MoolahSPOT",
    url: "https://www.moolahspot.com",
    description: "Scholarship search engine for small and large awards.",
  },
  {
    name: "CollegeScholarships.org",
    url: "https://www.collegescholarships.org",
    description: "Scholarship listings including minority scholarships and financial aid information.",
  },
  {
    name: "Black Excel",
    url: "https://blackexcel.org",
    description: "Scholarship resources focused on African American students.",
  },
  {
    name: "Hispanic Scholarship Fund",
    url: "https://www.hsf.net",
    description: "Scholarship organization helping Hispanic students access higher education funding.",
  },
  {
    name: "UNCF",
    url: "https://www.uncf.org",
    description: "Scholarships, fellowships, and internships for African American students and HBCU pathways.",
  },
  {
    name: "APIASF",
    url: "https://www.apiasf.org",
    description: "Scholarships for Asian and Pacific Islander American students.",
  },
  {
    name: "American Indian College Fund",
    url: "https://collegefund.org",
    description: "Scholarships and support for Native American students and tribal colleges.",
  },
  {
    name: "RaiseMe",
    url: "https://www.raise.me",
    description: "Micro-scholarships from colleges based on academic and extracurricular achievements.",
  },
  {
    name: "FinAid",
    url: "https://www.finaid.org",
    description: "Financial aid guide covering scholarships, grants, loans, and college savings.",
  },
];

const STATES: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

const SECTIONS: Section[] = [
  {
    id: "academics",
    title: "Academic Profile",
    subtitle: "Start with the fundamentals: GPA, rigor, and intended study area.",
    accent: "teal",
    questions: [
      {
        key: "gpa",
        label: "Cumulative GPA (Unweighted)",
        type: "slider",
        min: 1,
        max: 4,
        step: 0.1,
        format: (value) => value.toFixed(1),
        hint: "Use your official transcript GPA when possible.",
      },
      {
        key: "major",
        label: "Intended Area of Study",
        type: "select",
        options: [
          "Undecided",
          "Business & Entrepreneurship",
          "STEM - Engineering / CS / Math",
          "STEM - Life Sciences / Pre-Med",
          "Health & Allied Health",
          "Arts, Design & Performing Arts",
          "Education",
          "Law & Political Science",
          "Communications & Media",
          "Agriculture & Environment",
          "Trades & Applied Tech",
        ],
      },
      {
        key: "rigor",
        label: "Course Rigor",
        type: "select",
        note: {
          before: '"Rigor" is AP, DE, IB, sometimes ',
          emphasis: "Honors",
          after: ".",
        },
        options: [
          "0-1 advanced courses",
          "2-4 advanced courses",
          "5-8 advanced courses",
          "9+ advanced courses / Full IB Diploma",
        ],
      },
    ],
  },
  {
    id: "testing",
    title: "Test Scores",
    subtitle: "Share official scores when available, or leave scores at 0 for test optional.",
    accent: "teal",
    questions: [
      {
        key: "act_score",
        label: "ACT Composite Score",
        type: "slider",
        min: 0,
        max: 36,
        step: 1,
        format: (value) => (value === 0 ? "Test optional" : `ACT ${value}`),
        hint: "Use your official ACT composite score if available.",
      },
      {
        key: "test_score",
        label: "SAT Score",
        type: "slider",
        min: 0,
        max: 1600,
        step: 10,
        format: (value) => (value === 0 ? "Test optional" : `SAT ${value}`),
        hint: "Use your official SAT score if available.",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Reality",
    subtitle: "Affordability is the factor that turns a good list into a workable list.",
    accent: "amber",
    questions: [
      {
        key: "household_income",
        label: "Annual Household Income",
        type: "select",
        options: [
          "Under $30,000",
          "$30,000-$49,999",
          "$50,000-$74,999",
          "$75,000-$99,999",
          "$100,000-$149,999",
          "$150,000-$199,999",
          "$200,000+",
        ],
      },
      {
        key: "annual_budget",
        label: "Maximum Comfortable Annual Out-of-Pocket",
        type: "select",
        options: [
          "Under $10,000",
          "$10,000-$20,000",
          "$20,000-$30,000",
          "$30,000-$45,000",
          "$45,000-$60,000",
          "$60,000+",
          "Scholarships/aid required to decide",
        ],
      },
      {
        key: "aid_priority",
        label: "Financial Aid Priority",
        type: "multiselect",
        options: [
          "Need-based grants",
          "Merit scholarships",
          "Athletic scholarships",
          "Institutional aid / tuition discounting",
          "Loans acceptable",
          "Work-study programs",
        ],
      },
    ],
  },
  {
    id: "location",
    title: "Geography & Campus",
    subtitle: "Location, climate, and size shape the day-to-day life of college.",
    accent: "sage",
    questions: [
      {
        key: "home_state",
        label: "Your Home State",
        type: "select",
        options: [...Object.keys(STATES), "DC / Territories", "Outside USA"],
      },
      {
        key: "preferred_state",
        label: "Preferred State for College",
        type: "select",
        options: ["No Preference", ...Object.keys(STATES), "DC / Territories"],
        hint: "Used to prioritize live institution profiles where public data is available.",
      },
      {
        key: "preferred_climate",
        label: "Preferred Climate",
        type: "select",
        options: [
          "No Preference",
          "Warm and Humid",
          "Four Seasons with Cold Winters",
          "Mild and Rainy",
          "Sunny and Mild",
          "Dry with Open Plains",
          "Hot and Dry",
          "Mountain Weather",
          "Warm Year-Round",
          "Very Cold Winters",
        ],
      },
      {
        key: "setting",
        label: "Campus Setting",
        type: "select",
        options: [
          "Major urban city",
          "Mid-size city",
          "College town / small city",
          "Suburban",
          "Rural / scenic",
          "No Preference",
        ],
      },
      {
        key: "size_pref",
        label: "Campus Size Preference",
        type: "select",
        options: [
          "Very small (under 1,500)",
          "Small (1,500-3,000)",
          "Medium-small (3,001-7,500)",
          "Medium (7,501-15,000)",
          "Large (15,001-30,000)",
          "Very large (30,000+)",
          "No Preference",
        ],
      },
    ],
  },
  {
    id: "identity",
    title: "Who You Are",
    subtitle: "Add context that can surface better campus supports and targeted awards.",
    accent: "coral",
    questions: [
      {
        key: "institution_type",
        label: "Institution Type Interest",
        type: "multiselect",
        options: [
          "Research University",
          "Liberal Arts College",
          "HBCU",
          "Hispanic-Serving Institution",
          "Technical / Polytechnic",
          "Public state technical college",
          "Trade school / applied training",
          "Community or technical college transfer pathway",
          "Public flagship",
          "Private Non-Profit",
        ],
      },
      {
        key: "selectivity_comfort",
        label: "Selectivity Comfort",
        type: "select",
        options: [
          "Highly selective (< 15% admit rate)",
          "Selective (15-35%)",
          "Moderate (35-60%)",
          "Open-Access / Less Selective",
          "Mix of reach, match, and likely schools",
        ],
      },
      {
        key: "identity_flags",
        label: "Identity & Background",
        type: "multiselect",
        options: [
          "First-generation college student",
          "Student of color",
          "International student",
          "Student with disability / IEP/504",
          "LGBTQ+ identifying",
          "Student-athlete",
          "Rural / Small-Town Background",
          "Military-connected family",
        ],
      },
      {
        key: "post_grad_goal",
        label: "Primary Post-Graduation Goal",
        type: "select",
        options: [
          "Enter workforce immediately",
          "Graduate or professional school",
          "Start my own business / venture",
          "Public service, government, or nonprofit",
          "Arts, media, or creative industries",
          "Research / academia",
          "Undecided",
        ],
      },
    ],
  },
];

const COLLEGES: College[] = [
  {
    id: 170976,
    name: "University of Michigan-Ann Arbor",
    city: "Ann Arbor",
    state: "MI",
    ownership: "Public",
    hbcu: false,
    admitRate: 18,
    gradRate: 93,
    retentionRate: 97,
    enrollment: 31329,
    netPrice: 16200,
    earnings: 63000,
    admissionsUrl: "https://admissions.umich.edu/",
  },
  {
    id: 139959,
    name: "University of Georgia",
    city: "Athens",
    state: "GA",
    ownership: "Public",
    hbcu: false,
    admitRate: 43,
    gradRate: 87,
    retentionRate: 95,
    enrollment: 29733,
    netPrice: 18400,
    earnings: 50000,
    admissionsUrl: "https://www.admissions.uga.edu/",
  },
  {
    id: 131520,
    name: "Howard University",
    city: "Washington",
    state: "DC",
    ownership: "Private nonprofit",
    hbcu: true,
    admitRate: 35,
    gradRate: 68,
    retentionRate: 89,
    enrollment: 10002,
    netPrice: 24000,
    earnings: 48000,
    admissionsUrl: "https://admission.howard.edu/",
  },
  {
    id: 243780,
    name: "University of Wisconsin-Madison",
    city: "Madison",
    state: "WI",
    ownership: "Public",
    hbcu: false,
    admitRate: 49,
    gradRate: 89,
    retentionRate: 96,
    enrollment: 32615,
    netPrice: 15200,
    earnings: 55000,
    admissionsUrl: "https://admissions.wisc.edu/",
  },
  {
    id: 236948,
    name: "University of Washington-Seattle",
    city: "Seattle",
    state: "WA",
    ownership: "Public",
    hbcu: false,
    admitRate: 48,
    gradRate: 84,
    retentionRate: 95,
    enrollment: 33059,
    netPrice: 13800,
    earnings: 56000,
    admissionsUrl: "https://admit.washington.edu/",
  },
  {
    id: 193900,
    name: "New York University",
    city: "New York",
    state: "NY",
    ownership: "Private nonprofit",
    hbcu: false,
    admitRate: 12,
    gradRate: 85,
    retentionRate: 92,
    enrollment: 26733,
    netPrice: 38000,
    earnings: 60000,
    admissionsUrl: "https://www.nyu.edu/admissions.html",
  },
  {
    id: 110635,
    name: "University of California-Berkeley",
    city: "Berkeley",
    state: "CA",
    ownership: "Public",
    hbcu: false,
    admitRate: 11,
    gradRate: 93,
    retentionRate: 97,
    enrollment: 31780,
    netPrice: 15600,
    earnings: 70000,
    admissionsUrl: "https://admissions.berkeley.edu/",
  },
  {
    id: 228778,
    name: "The University of Texas at Austin",
    city: "Austin",
    state: "TX",
    ownership: "Public",
    hbcu: false,
    admitRate: 29,
    gradRate: 87,
    retentionRate: 96,
    enrollment: 40916,
    netPrice: 17600,
    earnings: 56000,
    admissionsUrl: "https://admissions.utexas.edu/",
  },
];

const INCOME_AID: Record<string, number> = {
  "Under $30,000": 18000,
  "$30,000-$49,999": 14000,
  "$50,000-$74,999": 11000,
  "$75,000-$99,999": 8000,
  "$100,000-$149,999": 5000,
  "$150,000-$199,999": 2000,
  "$200,000+": 0,
};

const BUDGET: Record<string, number> = {
  "Under $10,000": 10000,
  "$10,000-$20,000": 20000,
  "$20,000-$30,000": 30000,
  "$30,000-$45,000": 45000,
  "$45,000-$60,000": 60000,
  "$60,000+": 999999,
  "Scholarships/aid required to decide": 35000,
};

const SIZE_BANDS: Record<string, [number, number]> = {
  "Very small (under 1,500)": [0, 1500],
  "Small (1,500-3,000)": [1500, 3000],
  "Medium-small (3,001-7,500)": [3001, 7500],
  "Medium (7,501-15,000)": [7501, 15000],
  "Large (15,001-30,000)": [15001, 30000],
  "Very large (30,000+)": [30001, 999999],
  "No Preference": [0, 999999],
};

const SELECTIVITY_BANDS: Record<string, [number, number]> = {
  "Highly selective (< 15% admit rate)": [0, 15],
  "Selective (15-35%)": [15, 35],
  "Moderate (35-60%)": [35, 60],
  "Open-Access / Less Selective": [60, 100],
  "Mix of reach, match, and likely schools": [0, 100],
};

const defaultAnswers: Answers = {
  gpa: 3.4,
  test_score: 0,
  act_score: 0,
  major: "Undecided",
  rigor: "2-4 advanced courses",
  household_income: "$50,000-$74,999",
  annual_budget: "$20,000-$30,000",
  aid_priority: ["Need-based grants", "Merit scholarships"],
  home_state: "Georgia",
  preferred_state: "No Preference",
  preferred_climate: "No Preference",
  setting: "College town / small city",
  size_pref: "Medium (7,501-15,000)",
  institution_type: ["Public flagship"],
  selectivity_comfort: "Mix of reach, match, and likely schools",
  identity_flags: ["First-generation college student"],
  post_grad_goal: "Enter workforce immediately",
};

const defaultFilters: ScholarshipFilters = {
  deadline_before: "",
  min_amount: "1000",
  min_fit: "65",
};

const SAVED_SCHOOLS_KEY = "campusfit.savedSchools";
const SAVED_SCHOLARSHIPS_KEY_PREFIX = "campusfit.savedScholarships.";

function loadSavedSchools() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(SAVED_SCHOOLS_KEY);
    return stored ? (JSON.parse(stored) as ScoredCollege[]) : [];
  } catch {
    return [];
  }
}

function persistSavedSchools(schools: ScoredCollege[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SAVED_SCHOOLS_KEY, JSON.stringify(schools));
}

function loadSavedScholarshipsFromBrowser(email: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(`${SAVED_SCHOLARSHIPS_KEY_PREFIX}${email.toLowerCase()}`);
    return stored ? (JSON.parse(stored) as Scholarship[]) : [];
  } catch {
    return [];
  }
}

function persistSavedScholarshipsToBrowser(email: string, scholarships: Scholarship[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${SAVED_SCHOLARSHIPS_KEY_PREFIX}${email.toLowerCase()}`, JSON.stringify(scholarships));
}

function loadAuthUser() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistAuthUser(user: AuthUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (user) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function App() {
    useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const name =
          user.displayName ||
          user.email?.split("@")[0] ||
          "Student";

        setAuthUser({
          name,
          email: user.email || "",
          provider: user.providerData.some(
            (item) => item.providerId === "google.com"
          )
            ? "Google"
            : "Email",
        });
      } else {
        setAuthUser(null);
      }

      setAuthReady(true);
    });

    return unsubscribe;
  }, []);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
const [authReady, setAuthReady] = useState(false);
const [authForm, setAuthForm] = useState({
  name: "",
  email: "",
  password: "",
});
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<"survey" | "results">("survey");
  const [tab, setTab] = useState<ResultsTab>("colleges");
  const [filters, setFilters] = useState<ScholarshipFilters>(defaultFilters);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [savedScholarships, setSavedScholarships] = useState<Scholarship[]>([]);
  const [scholarshipStatus, setScholarshipStatus] = useState("Ready");
  const [colleges, setColleges] = useState<ScoredCollege[]>(() => scoreColleges(defaultAnswers, COLLEGES));
  const [savedSchools, setSavedSchools] = useState<ScoredCollege[]>(loadSavedSchools);
  const [collegeStatus, setCollegeStatus] = useState("Ready");
  const [collegeSource, setCollegeSource] = useState("Local starter profile set");
  const [billing, setBilling] = useState<BillingStatus>({
    plan: "free",
    subscription_status: "inactive",
    billing_configured: false,
    features: [],
  });
  const [billingMessage, setBillingMessage] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showUncleJ, setShowUncleJ] = useState(false);

  const previewColleges = useMemo(() => scoreColleges(answers, COLLEGES), [answers]);
  const savedSchoolIds = useMemo(() => new Set(savedSchools.map((school) => school.id)), [savedSchools]);
  const savedScholarshipIds = useMemo(
    () => new Set(savedScholarships.map((scholarship) => scholarship.id)),
    [savedScholarships],
  );
  const currentSection = SECTIONS[step];
  const progress = view === "results" ? 100 : Math.round((step / SECTIONS.length) * 100);
  const isPro = billing.plan === "pro";

  useEffect(() => {
    if (!authUser) {
      setBilling({
        plan: "free",
        subscription_status: "inactive",
        billing_configured: false,
        features: [],
      });
      return;
    }

    void loadBillingStatus(authUser.email);
    void loadSavedScholarships(authUser.email);

    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      setBillingMessage("Payment received. Pro access will unlock as soon as Stripe confirms the subscription.");
    } else if (params.get("billing") === "cancelled") {
      setBillingMessage("Checkout was cancelled. Your CampusFit Free access is unchanged.");
    }
    if (params.has("billing")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [authUser?.email]);

  const loadBillingStatus = async (email: string) => {
    try {
      const params = new URLSearchParams({ email });
      const response = await fetch(`${BACKEND_BASE}/api/billing/status?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Billing API returned ${response.status}`);
      }
      setBilling((await response.json()) as BillingStatus);
    } catch (error) {
      setBillingMessage("Billing status is temporarily unavailable. CampusFit Free remains active.");
    }
  };

  const loadSavedScholarships = async (email: string) => {
    const browserSaved = loadSavedScholarshipsFromBrowser(email);
    setSavedScholarships(browserSaved);

    try {
      const params = new URLSearchParams({ user_email: email });
      const response = await fetch(`${BACKEND_BASE}/api/scholarships/saved?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Saved scholarships API returned ${response.status}`);
      }
      const data = (await response.json()) as { results: Scholarship[] };
      const results = data.results || [];
      setSavedScholarships(results);
      persistSavedScholarshipsToBrowser(email, results);
    } catch (error) {
      console.warn("Saved scholarship lookup unavailable", error);
    }
  };

  
let googleSignInInProgress = false;

const signInWithProvider = async (provider: AuthProvider) => {
  if (provider !== "Google" || googleSignInInProgress) return;

  googleSignInInProgress = true;

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google sign-in failed:", error);

    const firebaseError = error as {
      code?: string;
      message?: string;
    };

    alert(
      `Google sign-in failed.\n${firebaseError.code ?? ""}\n${
        firebaseError.message ?? "Please try again."
      }`
    );
  } finally {
    googleSignInInProgress = false;
  }
};

  
  const signInWithEmail = async () => {
    const email = authForm.email.trim();
    const name = authForm.name.trim();

    if (!email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }

    if (!authForm.password || authForm.password.length < 6) {
      alert("Please enter a password with at least 6 characters.");
      return;
    }

    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        authForm.password
      );

      if (name) {
        await updateProfile(result.user, {
          displayName: name,
        });
      }
    } catch (error) {
      console.error("Email sign-up failed:", error);
      alert(
        "Could not create your account. This email may already be registered, or the password may be invalid."
      );
    }
  };

 const signOut = async () => {
  try {
    await firebaseSignOut(auth);
    setSavedScholarships([]);
  } catch (error) {
    console.error("Sign out failed:", error);
    alert("Could not sign out. Please try again.");
  }
};

  const updateAnswer = (key: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const toggleAnswer = (key: string, value: string) => {
    const current = Array.isArray(answers[key]) ? (answers[key] as string[]) : [];
    updateAnswer(key, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const saveSchool = (college: ScoredCollege) => {
    if (!isPro) {
      setShowUpgrade(true);
      return;
    }
    setSavedSchools((current) => {
      if (current.some((school) => school.id === college.id)) {
        return current;
      }
      const next = [...current, college];
      persistSavedSchools(next);
      return next;
    });
  };

  const removeSavedSchool = (collegeId: number) => {
    setSavedSchools((current) => {
      const next = current.filter((school) => school.id !== collegeId);
      persistSavedSchools(next);
      return next;
    });
  };

  const saveScholarship = async (scholarship: Scholarship) => {
    if (!authUser) {
      return;
    }
    if (!isPro) {
      setShowUpgrade(true);
      return;
    }

    const next = savedScholarships.some((item) => item.id === scholarship.id)
      ? savedScholarships
      : [...savedScholarships, scholarship];
    setSavedScholarships(next);
    persistSavedScholarshipsToBrowser(authUser.email, next);

    try {
      await fetch(`${BACKEND_BASE}/api/scholarships/saved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: authUser.email,
          scholarship,
        }),
      });
    } catch (error) {
      console.warn("Saved scholarship API unavailable", error);
    }
  };

  const removeSavedScholarship = async (scholarshipId: string) => {
    if (!authUser) {
      return;
    }

    const next = savedScholarships.filter((scholarship) => scholarship.id !== scholarshipId);
    setSavedScholarships(next);
    persistSavedScholarshipsToBrowser(authUser.email, next);

    try {
      const params = new URLSearchParams({ user_email: authUser.email });
      await fetch(`${BACKEND_BASE}/api/scholarships/saved/${encodeURIComponent(scholarshipId)}?${params.toString()}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("Saved scholarship removal unavailable", error);
    }
  };

  const beginUpgrade = async () => {
    if (!authUser) {
      return;
    }
    setBillingMessage("Opening secure CampusFit Pro checkout");
    try {
      const response = await fetch(`${BACKEND_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authUser.email,
          success_url: `${window.location.origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/?billing=cancelled`,
        }),
      });
      const data = (await response.json()) as { url?: string; detail?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.detail || "Checkout could not be started.");
      }
      window.location.assign(data.url);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Checkout could not be started.");
    }
  };

  const manageBilling = async () => {
    if (!authUser) {
      return;
    }
    try {
      const response = await fetch(`${BACKEND_BASE}/api/billing/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authUser.email, return_url: window.location.href }),
      });
      const data = (await response.json()) as { url?: string; detail?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.detail || "Billing portal could not be opened.");
      }
      window.location.assign(data.url);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Billing portal could not be opened.");
    }
  };

  const requirePro = () => {
    setShowUpgrade(true);
  };

  const exportMatchReport = () => {
    if (!isPro) {
      requirePro();
      return;
    }
    const rows = [
      ["CampusFit Pro Match Report"],
      ["Student", authUser?.name || ""],
      ["Major", String(answers.major)],
      [],
      ["College", "Location", "Fit", "Net Price", "Admissions Website"],
      ...colleges.map((college) => [
        college.name,
        `${college.city}, ${college.state}`,
        `${college.fit.total}%`,
        formatCurrency(college.fit.effectiveCost),
        college.admissionsUrl || "",
      ]),
      [],
      ["Scholarship", "Provider", "Fit", "Deadline", "Source"],
      ...scholarships.map((scholarship) => [
        scholarship.title,
        scholarship.provider,
        `${scholarship.fit_score}%`,
        scholarship.deadline || "Rolling",
        scholarship.source_url || "",
      ]),
    ];
    downloadTextFile(
      "campusfit-pro-match-report.csv",
      rows.map((row) => row.map(csvCell).join(",")).join("\n"),
      "text/csv;charset=utf-8",
    );
  };

  const downloadDeadlineReminders = () => {
    if (!isPro) {
      requirePro();
      return;
    }
    const events = scholarships
      .filter((scholarship) => scholarship.deadline)
      .map(
        (scholarship) =>
          `BEGIN:VEVENT\nUID:${scholarship.id}@campusfit.thehigheredplug.com\nDTSTART;VALUE=DATE:${String(
            scholarship.deadline,
          ).replace(/-/g, "")}\nSUMMARY:${escapeCalendarText(scholarship.title)} deadline\nDESCRIPTION:${escapeCalendarText(
            scholarship.source_url || "CampusFit scholarship reminder",
          )}\nEND:VEVENT`,
      );
    downloadTextFile(
      "campusfit-scholarship-deadlines.ics",
      `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//THEP DTR//CampusFit Pro//EN\n${events.join("\n")}\nEND:VCALENDAR`,
      "text/calendar;charset=utf-8",
    );
  };

  const shareWithAdvisor = () => {
    if (!isPro) {
      requirePro();
      return;
    }
    const topSchools = colleges
      .slice(0, 5)
      .map((college, index) => `${index + 1}. ${college.name} (${college.fit.total}% fit)`)
      .join("\n");
    const subject = encodeURIComponent(`${authUser?.name || "Student"}'s CampusFit Pro match list`);
    const body = encodeURIComponent(
      `Here is my current CampusFit Pro list from The Higher Ed Plug + DTR:\n\n${topSchools}\n\nMajor interest: ${String(
        answers.major,
      )}\nPreferred state: ${String(answers.preferred_state)}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const runScholarshipSearch = async () => {
  setScholarshipStatus("Searching scholarships...");

  const params = buildScholarshipQuery(answers, filters);

  try {
    const response = await fetch(
      `${BACKEND_BASE}/api/scholarships/search?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Scholarship API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      results?: Scholarship[];
    };

    const results = data.results || [];

    setScholarships(results);
    setScholarshipStatus(
      results.length
        ? `${results.length} scholarship matches found`
        : "No scholarships matched these filters. Try changing your search."
    );
  } catch (error) {
    console.error("Scholarship search failed:", error);

    setScholarshipStatus(
      error instanceof Error
        ? error.message
        : "Scholarship search failed. Please try again."
    );

    setScholarships([]);
  }

  setTab("scholarships");
};

  const runCollegeSearch = async () => {
  setCollegeStatus("Checking colleges for your selected location");
  const params = buildCollegeQuery(answers);

  
const selectedStateRaw = String(answers.preferred_state || "").trim();

const normalizeState = (value: unknown): string => {
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw || raw === "no preference" || raw === "any") {
    return "";
  }

  const entry = Object.entries(STATES).find(
    ([name, abbreviation]) =>
      name.toLowerCase() === raw ||
      abbreviation.toLowerCase() === raw
  );

  if (entry) return entry[1].toUpperCase();

  if (raw === "dc" || raw === "district of columbia") return "DC";

  return raw.toUpperCase();
};

const selectedState = normalizeState(selectedStateRaw);

const matchesSelectedState = (college: College) => {
  if (!selectedState) return true;

  return normalizeState(college.state) === selectedState;
};


  try {
    const response = await fetch(
      `${BACKEND_BASE}/api/colleges/search?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`College API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      results: College[];
      source?: {
        label?: string;
        url?: string;
        retrieved_live?: boolean;
      };
    };

    const sourceColleges = data.results || [];
    const filteredColleges = sourceColleges.filter(matchesSelectedState);

    setColleges(scoreColleges(answers, filteredColleges));
    setCollegeSource(data.source?.label || "Live public sources");

    setCollegeStatus(
      filteredColleges.length
        ? `${filteredColleges.length} colleges found for your selection`
        : "No colleges found for that location. Try another state or region."
    );
  } catch (error) {
    console.error("College search failed:", error);

    const fallbackResults = previewColleges.filter(matchesSelectedState);

    setColleges(fallbackResults);
    setCollegeSource("Local starter profiles");

    setCollegeStatus(
      fallbackResults.length
        ? "Live search unavailable. Showing matching starter profiles."
        : "No matching starter profiles found for that location."
    );
  }

  setView("results");
  setTab("colleges");
};

 if (!authReady) {
  return (
    <main className="app-shell">
      <p>Loading CampusFit...</p>
    </main>
  );
}

if (!authUser) {
  return (
    <LoginScreen
      form={authForm}
      onFormChange={setAuthForm}
      onProviderSignIn={signInWithProvider}
      onEmailSignIn={signInWithEmail}
    />
  );
}

  if (view === "results") {
    return (
      <main className="app-shell">
        <Header
          onReset={() => setView("survey")}
          plan={billing.plan}
          onUpgrade={() => setShowUpgrade(true)}
          onManageBilling={manageBilling}
          onSignOut={signOut}
        />
        <BillingNotice message={billingMessage} onDismiss={() => setBillingMessage("")} />
        <section className="results-hero">
          <div>
            <p className="eyebrow">THEP + DTR CampusFit Match</p>
            <h1>Your Fit List Is Ready.</h1>
            <p>
              Powered by The Higher Ed Plug and DTR, your ranked colleges and scholarship leads are tuned
              to your profile, budget, academic direction, and support needs.
            </p>
          </div>
          <div className="score-orbit">
            <span>{colleges[0]?.fit.total ?? 0}%</span>
            <small>Top Fit</small>
          </div>
        </section>

        <section className="tabs" aria-label="Results tabs">
          <button className={tab === "colleges" ? "active" : ""} onClick={() => setTab("colleges")}>
            Colleges
          </button>
          <button className={tab === "scholarships" ? "active" : ""} onClick={() => setTab("scholarships")}>
            Scholarships
          </button>
          <button
            className={tab === "saved" ? "active" : ""}
            onClick={() => (isPro ? setTab("saved") : requirePro())}
          >
            {isPro ? "Saved Lists" : "Saved Lists - Pro"}
          </button>
        </section>
        <ProToolbox
          isPro={isPro}
          onUpgrade={requirePro}
          onExport={exportMatchReport}
          onReminders={downloadDeadlineReminders}
          onShare={shareWithAdvisor}
          onUncleJ={() => (isPro ? setShowUncleJ(true) : requirePro())}
        />

        {tab === "colleges" ? (
          <CollegeResults
            colleges={colleges}
            answers={answers}
            source={collegeSource}
            status={collegeStatus}
            onScholarships={runScholarshipSearch}
            savedSchoolIds={savedSchoolIds}
            onSaveSchool={saveSchool}
            onRemoveSavedSchool={removeSavedSchool}
            isPro={isPro}
            onUpgrade={requirePro}
          />
        ) : tab === "scholarships" ? (
          <ScholarshipResults
            scholarships={scholarships}
            answers={answers}
            filters={filters}
            status={scholarshipStatus}
            onFilterChange={setFilters}
            onSearch={runScholarshipSearch}
            savedScholarshipIds={savedScholarshipIds}
            onSaveScholarship={saveScholarship}
            onRemoveSavedScholarship={removeSavedScholarship}
            isPro={isPro}
            onUpgrade={requirePro}
          />
        ) : (
          <SavedListsFolder
            schools={savedSchools}
            scholarships={savedScholarships}
            answers={answers}
            onRemoveSavedSchool={removeSavedSchool}
            onRemoveSavedScholarship={removeSavedScholarship}
            onScholarships={runScholarshipSearch}
          />
        )}
        {isPro ? <PremiumRecommendations colleges={colleges} answers={answers} /> : null}
        <UpgradeModal
          open={showUpgrade}
          billingConfigured={billing.billing_configured}
          message={billingMessage}
          onClose={() => setShowUpgrade(false)}
          onUpgrade={beginUpgrade}
        />
        <UncleJChat
  open={showUncleJ}
  onClose={() => setShowUncleJ(false)}
/>

<footer className="campusfit-footer">
  <div className="footer-actions">
    <a href="/privacy.html">Privacy Policy</a>

    <a href="mailto:unclej@thehigheredplug.com">
      Contact Support
    </a>
  </div>

  <span>© {new Date().getFullYear()} CampusFit</span>
</footer>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header
        plan={billing.plan}
        onUpgrade={() => setShowUpgrade(true)}
        onManageBilling={manageBilling}
        onSignOut={signOut}
      />
      <BillingNotice message={billingMessage} onDismiss={() => setBillingMessage("")} />
      <section className="survey-hero">
        <div className="hero-copy">
          <p className="eyebrow">The Higher Ed Plug + Disrupting The Regular</p>
          <h1>
  CampusFit <span className="beta-label">beta</span>
</h1>
          <p>
            A college and scholarship matching experience built for practical decisions:
            fit, affordability, support, and next steps.
          </p>
        </div>
        <div className="hero-panel" aria-label="Survey progress">
          <span>{progress}%</span>
          <small>Profile Complete</small>
          <div className="meter">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>
      <ResponsiveDisplayAd variant="leaderboard" placement="survey-top" />

      <section className="survey-grid">
        <aside className="section-rail" aria-label="Survey sections">
          {SECTIONS.map((section, index) => (
            <button
              key={section.id}
              className={index === step ? `active ${section.accent}` : ""}
              onClick={() => setStep(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </button>
          ))}
          <button className="match-tab" onClick={runCollegeSearch}>
            <span>06</span>
            Match
          </button>
        </aside>

        <section className={`question-panel ${currentSection.accent}`}>
          <div className="arrow-nav" aria-label="Section navigation">
            <button
              type="button"
              aria-label="Previous section"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              &lt;
            </button>
            <button
              type="button"
              aria-label="Next section"
              disabled={step === SECTIONS.length - 1}
              onClick={() => setStep((value) => Math.min(SECTIONS.length - 1, value + 1))}
            >
              &gt;
            </button>
          </div>
          <div className="panel-heading">
            <p className="eyebrow">Step {step + 1} of {SECTIONS.length}</p>
            <h2>{currentSection.title}</h2>
            <p>{currentSection.subtitle}</p>
          </div>

          <div className="question-list">
            {currentSection.questions.map((question) => (
              <QuestionControl
                key={question.key}
                question={question}
                value={answers[question.key]}
                onChange={updateAnswer}
                onToggle={toggleAnswer}
              />
            ))}
          </div>

          <footer className="panel-actions">
            <button className="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
              &lt;- Back
            </button>
            {step < SECTIONS.length - 1 ? (
              <button className="primary" onClick={() => setStep((value) => value + 1)}>
                Continue -&gt;
              </button>
            ) : (
              <button className="primary" onClick={runCollegeSearch}>
                Build Source-Checked Matches
              </button>
            )}
          </footer>
        </section>
      </section>
      <UpgradeModal
        open={showUpgrade}
        billingConfigured={billing.billing_configured}
        message={billingMessage}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={beginUpgrade}
      />
      <footer className="campusfit-footer">
  <div className="footer-actions">
    <button
      className="ghost"
      type="button"
      onClick={signOut}
    >
      Sign Out
    </button>

    <a href="/privacy.html">Privacy Policy</a>
<a
  href="https://mail.google.com/mail/?view=cm&to=unclej%40thehigheredplug.com"
  target="_blank"
  rel="noopener noreferrer"
>
  Contact Support
</a>
  </div>

  <span>© {new Date().getFullYear()} CampusFit</span>
</footer>
    </main>
  );
}

async function sendLoginToGoogleForm(user: AuthUser) {
  if (!GOOGLE_FORM_ACTION_URL || !GOOGLE_FORM_FIELDS.email) {
    return;
  }

  const payload = new URLSearchParams();
  if (GOOGLE_FORM_FIELDS.name) payload.set(GOOGLE_FORM_FIELDS.name, user.name);
  payload.set(GOOGLE_FORM_FIELDS.email, user.email);
  if (GOOGLE_FORM_FIELDS.provider) payload.set(GOOGLE_FORM_FIELDS.provider, user.provider);
  if (GOOGLE_FORM_FIELDS.timestamp) payload.set(GOOGLE_FORM_FIELDS.timestamp, new Date().toISOString());

  try {
    await fetch(GOOGLE_FORM_ACTION_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });
  } catch (error) {
    console.warn("Google Form login capture unavailable", error);
  }
}

function LoginScreen({
  form,
  onFormChange,
  onProviderSignIn,
  onEmailSignIn,
}: {
  form: { name: string; email: string; password: string };
  onFormChange: (form: {
    name: string;
    email: string;
    password: string;
  }) => void;
  onProviderSignIn: (provider: AuthProvider) => void;
  onEmailSignIn: () => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <img
          src="/assets/thep-dtr-banner.png"
          alt="The Higher Ed Plug plus DTR"
        />
        <div>
          <p className="eyebrow">The Higher Ed Plug + Disrupting The Regular</p>
          <h1>CampusFit</h1>
          <p>
            Sign in to build a college fit list, compare affordability, and find
            source-checked scholarship opportunities.
          </p>
        </div>
      </section>

      <section className="login-card" aria-label="CampusFit sign in">
        <p className="eyebrow">Student Access</p>
        <h2>
          Welcome to <span className="dtr-title-accent">CampusFit</span>
        </h2>
        <p>Use a connected account or email to begin your match profile.</p>

        <div className="oauth-stack">
          <button
            className="google-login"
            type="button"
            onClick={() => onProviderSignIn("Google")}
          >
            <span>G</span>
            Continue with Google
          </button>
        </div>

        <div className="login-divider">
          <span>Email Sign In</span>
        </div>

        <div className="email-login-form">
          <label>
            Full name
            <input
              type="text"
              placeholder="Student name"
              autoComplete="name"
              value={form.name}
              onChange={(event) =>
                onFormChange({ ...form, name: event.target.value })
              }
            />
          </label>

          <label>
            Email address
            <input
              type="email"
              placeholder="student@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                onFormChange({ ...form, email: event.target.value })
              }
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                onFormChange({ ...form, password: event.target.value })
              }
            />
          </label>

          <button
            className="primary full"
            type="button"
            onClick={onEmailSignIn}
            disabled={!form.email.includes("@") || !form.password}
          >
            Continue with Email
          </button>
        </div>
      </section>

           <PlanComparison />

    <footer className="campusfit-footer">
  <div className="footer-actions">
{/* Sign Out button temporarily removed */}

    <a href="/privacy.html">Privacy Policy</a>

   <a
  href="https://mail.google.com/mail/?view=cm&to=unclej%40thehigheredplug.com"
  target="_blank"
  rel="noopener noreferrer"
>
  Contact Support
</a>
  </div>

  <span>© {new Date().getFullYear()} CampusFit</span>
</footer>
    </main>
  );
}
function Header({
  onReset,
  plan,
  onUpgrade,
  onManageBilling,
  onSignOut,
}: {
  onReset?: () => void;
  plan: PlanTier;
  onUpgrade: () => void;
  onManageBilling: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onReset}>
        <img src="/assets/thep-dtr-banner.png" alt="The Higher Ed Plug plus DTR" />
      </button>
      <div className="account-actions">
      <div className={`plan-badge ${plan}`}>
  <span>
    {plan === "pro" ? "CampusFit Pro" : "CampusFit Free"}
    {plan === "pro" && (
      <span className="pro-coming-soon">Coming Soon</span>
    )}
  </span>
  <strong>{plan === "pro" ? "Premium tools unlocked" : "Core matching access"}</strong>
</div>
        <div className="header-upgrade">
  <button
    className={plan === "pro" ? "ghost" : "primary"}
    onClick={plan === "pro" ? onManageBilling : onUpgrade}
  >
    {plan === "pro" ? "Manage Billing" : "Upgrade to Pro"}
  </button>

  <span className="pro-coming-soon">Coming Soon</span>
</div>
        
        <a className="ghost" href="/privacy.html">
  Privacy Policy
</a>

<a
  className="ghost"
  href="https://mail.google.com/mail/?view=cm&to=unclej%40thehigheredplug.com"
  target="_blank"
  rel="noopener noreferrer"
>
  Contact Support
</a>

      </div>
    </header>
  );
}

function PlanComparison() {
  return (
    <section className="plan-comparison" aria-label="CampusFit plans">
      <article className="plan-card free">
        <p className="eyebrow">Start Free</p>
        <h2>CampusFit Free</h2>
        <strong>No payment required</strong>
        <ul>
          <li>Up to {FREE_COLLEGE_LIMIT} college matches</li>
          <li>Preview {FREE_SCHOLARSHIP_LIMIT} scholarship results</li>
          <li>Core academic and affordability profile</li>
          <li>Direct admissions and scholarship source links</li>
        </ul>
      </article>

      <article className="plan-card pro">
        <p className="eyebrow">Upgrade</p>
       <h2>CampusFit Pro</h2>
        <strong>{PRO_PRICE_LABEL}</strong>

        <p className="pro-frame-notice">Coming Soon!</p>

        <ul>
          {PRO_FEATURES.map((feature) => (
            <li key={feature.label}>
              {feature.label}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}


function ResponsiveDisplayAd({
  variant,
  placement,
}: {
  variant: AdVariant;
  placement: string;
}) {
  return (
    <a
      className={`display-ad display-ad-${variant}`}
      href="https://www.thehigheredplug.com/"
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label="Visit The Higher Ed Plug"
      data-ad-placement={placement}
    >
      <img
        src="/3829.png"
        alt="The Higher Ed Plug advertisement"
        className="display-ad-image"
      />
    </a>
  );
}




function BillingNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) {
    return null;
  }
  return (
    <div className="billing-notice" role="status">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss billing message">
        x
      </button>
    </div>
  );
}

function UpgradeModal({
  open,
  billingConfigured,
  message,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  billingConfigured: boolean;
  message: string;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close upgrade dialog">
          x
        </button>
        <p className="eyebrow">CampusFit Pro</p>
        <h2 id="upgrade-title">Unlock Deeper College Planning</h2>
        <p className="upgrade-price">{PRO_PRICE_LABEL}</p>
        <div className="upgrade-feature-grid">
          {PRO_FEATURES.map((feature) => (
            <div key={feature.label}>
              <span>{feature.status === "coming" ? "Soon" : "Pro"}</span>
              <b>{feature.label}</b>
            </div>
          ))}
        </div>
        {message ? <p className="modal-message">{message}</p> : null}
        <button className="primary full" type="button" onClick={onUpgrade}>
          {billingConfigured ? "Continue to Secure Checkout" : "Set Up Pro Checkout"}
        </button>
        {!billingConfigured ? (
          <small>Stripe keys and a recurring Price ID must be added to the deployment before live charges can begin.</small>
        ) : (
          <small>Payment and subscription management are securely hosted by Stripe.</small>
        )}
      </section>
    </div>
  );
}

function ProToolbox({
  isPro,
  onUpgrade,
  onExport,
  onReminders,
  onShare,
  onUncleJ,
}: {
  isPro: boolean;
  onUpgrade: () => void;
  onExport: () => void;
  onReminders: () => void;
  onShare: () => void;
  onUncleJ: () => void;
}) {
  return (
    <section className="pro-toolbox" aria-label="CampusFit Pro tools">
      <div>
        <p className="eyebrow">CampusFit Pro Planning Tools</p>
        <h2>{isPro ? "Premium Tools Unlocked" : "Go Beyond the Preview"}</h2>
      </div>
      <div className="pro-tool-actions">
        <button type="button" className="ghost" onClick={onExport}>
          Export Report {!isPro ? " - Pro" : ""}
        </button>
        <button type="button" className="ghost" onClick={onReminders}>
          Deadline Reminders {!isPro ? " - Pro" : ""}
        </button>
        <button type="button" className="ghost" onClick={onShare}>
          Share with Advisor {!isPro ? " - Pro" : ""}
        </button>
        <button type="button" className="ghost" onClick={onUncleJ}>
          DTR Uncle J {!isPro ? " - Pro" : ""}
        </button>
        {!isPro ? (
          <button type="button" className="primary" onClick={onUpgrade}>
            Unlock CampusFit Pro
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PremiumRecommendations({ colleges, answers }: { colleges: ScoredCollege[]; answers: Answers }) {
  const topCollege = colleges[0];
  if (!topCollege) {
    return null;
  }
  return (
    <section className="premium-recommendations">
      <p className="eyebrow">Premium THEP + DTR Recommendation</p>
      <h2>Build a balanced list around {topCollege.name}</h2>
      <p>
        Your strongest current signal is {topCollege.fit.total}% fit for {String(answers.major)}. Keep this school as an
        anchor, compare two lower-cost options, and add at least one likely-admission choice before finalizing your list.
      </p>
      <div className="recommendation-stats">
        <span>Preferred state: {String(answers.preferred_state)}</span>
        <span>Budget: {String(answers.annual_budget)}</span>
        <span>Climate: {String(answers.preferred_climate)}</span>
      </div>
    </section>
  );
}

function UncleJChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    "Uncle J here. Ask me about building a balanced college list, scholarship deadlines, or what to do next.",
  ]);

  if (!open) {
    return null;
  }

  const reply = () => {
    const prompt = question.trim();
    if (!prompt) {
      return;
    }
    const lower = prompt.toLowerCase();
    const answer = lower.includes("scholar")
      ? "Start with the closest deadlines, confirm eligibility on the original source, and submit the strongest-fit opportunities first."
      : lower.includes("essay")
        ? "Lead with one specific moment, show what changed in your thinking, and connect that growth to the opportunity ahead."
        : lower.includes("college") || lower.includes("match")
          ? "Keep a balanced list: a few likely options, several strong matches, and only a small number of reaches that still fit your budget."
          : "Break the decision into fit, affordability, support, and next action. Pick the one category that is least clear and work there first.";
    setMessages((current) => [...current, `You: ${prompt}`, `Uncle J: ${answer}`]);
    setQuestion("");
  };

  return (
    <div className="modal-backdrop">
      <section className="uncle-j-chat" role="dialog" aria-modal="true" aria-labelledby="uncle-j-title">
        <div className="chat-heading">
          <div>
            <p className="eyebrow">CampusFit Pro</p>
            <h2 id="uncle-j-title">DTR Uncle J</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close DTR Uncle J">
            x
          </button>
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
        </div>
        <div className="chat-compose">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") reply();
            }}
            placeholder="Ask Uncle J a planning question"
          />
          <button type="button" className="primary" onClick={reply}>
            Send
          </button>
        </div>
      </section>
    </div>
  );
}

function QuestionControl({
  question,
  value,
  onChange,
  onToggle,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (key: string, value: AnswerValue) => void;
  onToggle: (key: string, value: string) => void;
}) {
  if (question.type === "slider") {
    const numericValue = Number(value);
    return (
      <label className="question-card">
        <div className="question-topline">
          <span>{question.label}</span>
          <b>{question.format(numericValue)}</b>
        </div>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step}
          value={numericValue}
          onChange={(event) => onChange(question.key, Number(event.target.value))}
        />
        {question.hint ? <small>{question.hint}</small> : null}
      </label>
    );
  }

  if (question.type === "select") {
    return (
      <label className="question-card">
        <span>{question.label}</span>
        <select value={String(value)} onChange={(event) => onChange(question.key, event.target.value)}>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {question.hint ? <small>{question.hint}</small> : null}
        {question.note ? (
          <small className="question-note">
            {question.note.before}
            <em>{question.note.emphasis}</em>
            {question.note.after}
          </small>
        ) : null}
      </label>
    );
  }

  const values = Array.isArray(value) ? value : [];
  return (
    <fieldset className="question-card">
      <legend>{question.label}</legend>
      <div className="choice-grid">
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            className={values.includes(option) ? "choice selected" : "choice"}
            onClick={() => onToggle(question.key, option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CollegeResults({
  colleges,
  answers,
  source,
  status,
  onScholarships,
  savedSchoolIds,
  onSaveSchool,
  onRemoveSavedSchool,
  isPro,
  onUpgrade,
}: {
  colleges: ScoredCollege[];
  answers: Answers;
  source: string;
  status: string;
  onScholarships: () => void;
  savedSchoolIds: Set<number>;
  onSaveSchool: (college: ScoredCollege) => void;
  onRemoveSavedSchool: (collegeId: number) => void;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const visibleColleges = isPro ? colleges : colleges.slice(0, FREE_COLLEGE_LIMIT);
  return (
    <section className="result-layout">
      <aside className="insight-panel">
        
        <p className="eyebrow">Profile Signal</p>
        <h2>{String(answers.major)}</h2>
        <div className="source-note">
          <b>{status}</b>
          <span>{source}</span>
        </div>
        <dl>
          <div>
            <dt>Home State</dt>
            <dd>{String(answers.home_state)}</dd>
          </div>
          <div>
            <dt>Preferred State</dt>
            <dd>{String(answers.preferred_state)}</dd>
          </div>
          <div>
            <dt>Preferred Climate</dt>
            <dd>{String(answers.preferred_climate)}</dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>{String(answers.annual_budget)}</dd>
          </div>
          <div>
            <dt>Identity Tags</dt>
            <dd>{Array.isArray(answers.identity_flags) ? answers.identity_flags.length : 0}</dd>
          </div>
        </dl>
        <button className="primary full" onClick={onScholarships}>
          Find Scholarships
        </button>
      </aside>

      <div className="college-list">
        {visibleColleges.map((college, index) => (
          <CollegeCard
            key={college.id}
            college={college}
            rank={index + 1}
            isSaved={savedSchoolIds.has(college.id)}
            onSave={onSaveSchool}
            onRemove={onRemoveSavedSchool}
            locked={!isPro}
          />
        ))}
        {!isPro && colleges.length > FREE_COLLEGE_LIMIT ? (
          <LockedFeaturePanel
            title={`${colleges.length - FREE_COLLEGE_LIMIT} More College Matches`}
            description="CampusFit Pro removes the match limit and keeps the full ranked list available."
            onUpgrade={onUpgrade}
          />
        ) : null}
      </div>
    </section>
  );
}

function SavedListsFolder({
  schools,
  scholarships,
  answers,
  onRemoveSavedSchool,
  onRemoveSavedScholarship,
  onScholarships,
}: {
  schools: ScoredCollege[];
  scholarships: Scholarship[];
  answers: Answers;
  onRemoveSavedSchool: (collegeId: number) => void;
  onRemoveSavedScholarship: (scholarshipId: string) => void;
  onScholarships: () => void;
}) {
  if (!schools.length && !scholarships.length) {
    return (
      <section className="empty-state">
        <p className="eyebrow">CampusFit Pro Saved Lists</p>
        <h2>No Saved Items Yet</h2>
        <p>Saved college and scholarship matches will appear here and remain available when users return.</p>
      </section>
    );
  }

  return (
    <section className="result-layout">
      <aside className="insight-panel">
        <p className="eyebrow">CampusFit Pro Saved Lists</p>
        <h2>{schools.length + scholarships.length} Saved</h2>
        <dl>
          <div>
            <dt>Major Interest</dt>
            <dd>{String(answers.major)}</dd>
          </div>
          <div>
            <dt>Preferred State</dt>
            <dd>{String(answers.preferred_state)}</dd>
          </div>
          <div>
            <dt>Preferred Climate</dt>
            <dd>{String(answers.preferred_climate)}</dd>
          </div>
        </dl>
        <button className="primary full" onClick={onScholarships}>
          Find Scholarships
        </button>
      
      </aside>

      <div className="saved-list-content">
        {schools.length ? (
          <section>
            <h2>Saved Schools</h2>
            <div className="college-list">
              {schools.map((college, index) => (
                <CollegeCard
                  key={college.id}
                  college={college}
                  rank={index + 1}
                  isSaved
                  onRemove={onRemoveSavedSchool}
                />
              ))}
            </div>
          </section>
        ) : null}
        {scholarships.length ? (
          <section>
            <h2>Saved Scholarships</h2>
            <div className="scholarship-grid">
              {scholarships.map((scholarship) => (
                <ScholarshipCard
                  key={scholarship.id}
                  scholarship={scholarship}
                  isSaved
                  onSave={() => undefined}
                  onRemove={onRemoveSavedScholarship}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function LockedFeaturePanel({
  title,
  description,
  onUpgrade,
}: {
  title: string;
  description: string;
  onUpgrade: () => void;
}) {
  return (
    <section className="locked-feature">
      <span>CampusFit Pro</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="primary" type="button" onClick={onUpgrade}>
        Unlock Pro
      </button>
    </section>
  );
}

function CollegeCard({
  college,
  rank,
  isSaved,
  onSave,
  onRemove,
  locked = false,
}: {
  college: ScoredCollege;
  rank: number;
  isSaved: boolean;
  onSave?: (college: ScoredCollege) => void;
  onRemove: (collegeId: number) => void;
  locked?: boolean;
}) {
  return (
    <article className="result-card">
      <div className="rank">{rank}</div>
      <div className="result-main">
        <div className="result-heading">
          <div>
            <h3>{college.name}</h3>
            <p>{college.city}, {college.state} - {college.ownership}</p>
            <div className="result-actions">
              {college.sourceLabel ? (
                <a className="source-link" href={college.sourceUrl} target="_blank" rel="noreferrer">
                  Source: {college.sourceLabel}
                </a>
              ) : null}
              {college.admissionsUrl ? (
                <a className="source-link" href={college.admissionsUrl} target="_blank" rel="noreferrer">
                  Admissions Website
                </a>
              ) : null}
              <button
                className={isSaved ? "save-school-button saved" : "save-school-button"}
                type="button"
                onClick={() => (locked ? onSave?.(college) : isSaved ? onRemove(college.id) : onSave?.(college))}
              >
                {locked ? "Save School - Pro" : isSaved ? "Saved" : "Save School"}
              </button>
            </div>
          </div>
          <FitBadge score={college.fit.total} />
        </div>
        <div className="metrics">
          <Metric label="Net Price" value={formatCurrency(college.fit.effectiveCost)} />
          <Metric label="Grad Rate" value={`${college.gradRate}%`} />
          <Metric label="Admit Rate" value={`${college.admitRate}%`} />
          <Metric label="Median Earnings" value={formatCurrency(college.earnings)} />
        </div>
        <div className="bar-stack">
          <ScoreBar label="Affordability" value={college.fit.affordability} max={30} />
          <ScoreBar label="Student Success" value={college.fit.studentSuccess} max={25} />
          <ScoreBar label="Outcomes" value={college.fit.outcomes} max={20} />
        </div>
      </div>
    </article>
  );
}

function ScholarshipResults({
  scholarships,
  answers,
  filters,
  status,
  onFilterChange,
  onSearch,
  savedScholarshipIds,
  onSaveScholarship,
  onRemoveSavedScholarship,
  isPro,
  onUpgrade,
}: {
  scholarships: Scholarship[];
  answers: Answers;
  filters: ScholarshipFilters;
  status: string;
  onFilterChange: (filters: ScholarshipFilters) => void;
  onSearch: () => void;
  savedScholarshipIds: Set<string>;
  onSaveScholarship: (scholarship: Scholarship) => void;
  onRemoveSavedScholarship: (scholarshipId: string) => void;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const nativeSources = buildNativeScholarshipSearches(answers, filters);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("Ready to send full search list");
  const visibleScholarships = isPro ? scholarships : scholarships.slice(0, FREE_SCHOLARSHIP_LIMIT);

  const sendSourceList = async () => {
    setEmailStatus("Preparing source list");
    try {
      const response = await fetch(`${BACKEND_BASE}/api/scholarships/sources/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          major: normalizeMajor(String(answers.major)),
          gpa_band: gpaBand(Number(answers.gpa)),
          sat_score: Number(answers.test_score) || 0,
          act_score: Number(answers.act_score) || 0,
          deadline_before: filters.deadline_before || null,
          min_amount: filters.min_amount ? Number(filters.min_amount) : null,
        }),
      });
      if (!response.ok) {
        throw new Error("Email request failed");
      }
      const data = (await response.json()) as { source_count?: number };
      setEmailStatus(`Prepared ${data.source_count || nativeSources.length} source links for ${email}`);
    } catch (error) {
      setEmailStatus("Could not prepare email. Check the address and try again.");
    }
  };

  return (
    <section className="scholarship-section">
      <div className="native-source-panel">
        <div>
          <p className="eyebrow">Full Scholarship Source List</p>
          <h2>Send the Complete Search List</h2>
          <p>
            CampusFit prepares verified source URLs behind the scenes using your academic profile, deadline,
            and award amount filters.
          </p>
          <span className="saved-count">
            {isPro ? `${savedScholarshipIds.size} Saved Scholarships` : "CampusFit Pro feature"}
          </span>
        </div>
        <div className="email-source-form">
          <label>
            Email address
            <input
              type="email"
              placeholder="student@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button
            className="primary"
            type="button"
            onClick={isPro ? sendSourceList : onUpgrade}
            disabled={isPro && !email}
          >
            {isPro ? "Send Source List" : "Unlock Full Source List"}
          </button>
          <span>{emailStatus}</span>
        </div>
      </div>

      <div className="filter-strip">
        <label>
          Deadline before
          <input
            type="date"
            value={filters.deadline_before}
            disabled={!isPro}
            onChange={(event) => onFilterChange({ ...filters, deadline_before: event.target.value })}
          />
        </label>
        <label>
          Minimum amount
          <input
            type="number"
            min="0"
            step="250"
            value={filters.min_amount}
            disabled={!isPro}
            onChange={(event) => onFilterChange({ ...filters, min_amount: event.target.value })}
          />
        </label>
        <label>
          Minimum fit
          <input
            type="number"
            min="0"
            max="100"
            value={filters.min_fit}
            disabled={!isPro}
            onChange={(event) => onFilterChange({ ...filters, min_fit: event.target.value })}
          />
        </label>
        <button className="primary" onClick={onSearch}>
          Apply Filters
        </button>
        <span className="status-pill">{status}</span>
      </div>
     

      {scholarships.length === 0 ? (
        <div className="empty-state">
          <h2>Run a Scholarship Search</h2>
          <p>Funding matches will be optimized from your academic profile.</p>
          <button className="primary" onClick={onSearch}>
            Search Scholarships
          </button>
        </div>
      ) : (
        <div className="scholarship-grid">
          {visibleScholarships.map((scholarship) => (
            <ScholarshipCard
              key={scholarship.id}
              scholarship={scholarship}
              isSaved={savedScholarshipIds.has(scholarship.id)}
              onSave={onSaveScholarship}
              onRemove={onRemoveSavedScholarship}
              locked={!isPro}
              onUpgrade={onUpgrade}
            />
          ))}
          {!isPro && scholarships.length > FREE_SCHOLARSHIP_LIMIT ? (
            <LockedFeaturePanel
              title={`${scholarships.length - FREE_SCHOLARSHIP_LIMIT} More Scholarship Results`}
              description="CampusFit Pro unlocks the complete result set, saving, deadline filters, amount filters, and fit controls."
              onUpgrade={onUpgrade}
            />
          ) : null}
        </div>
      )}
      <ResponsiveDisplayAd variant="leaderboard" placement="scholarship-results-bottom" />
    </section>
  );
}

function ScholarshipCard({
  scholarship,
  isSaved,
  onSave,
  onRemove,
  locked = false,
  onUpgrade,
}: {
  scholarship: Scholarship;
  isSaved: boolean;
  onSave: (scholarship: Scholarship) => void;
  onRemove: (scholarshipId: string) => void;
  locked?: boolean;
  onUpgrade?: () => void;
}) {
  return (
    <article className="scholarship-card">
      <div className="result-heading">
        <div>
          <p>{scholarship.provider}</p>
          <h3>{scholarship.title}</h3>
        </div>
        <FitBadge score={scholarship.fit_score} />
      </div>
      <div className="award-row">
        <b>{formatAward(scholarship)}</b>
        <span>{scholarship.deadline ? `Due ${formatDate(scholarship.deadline)}` : "Rolling deadline"}</span>
      </div>
      <p className="why">{scholarship.why}</p>
      {scholarship.source_url ? (
        <a className="source-link" href={scholarship.source_url} target="_blank" rel="noreferrer">
          Verify opportunity source
        </a>
      ) : null}
      <button
        className={isSaved ? "save-school-button saved" : "save-school-button"}
        type="button"
        onClick={() =>
          locked ? onUpgrade?.() : isSaved ? onRemove(scholarship.id) : onSave(scholarship)
        }
      >
        {locked ? "Save Scholarship - Pro" : isSaved ? "Saved Scholarship" : "Save Scholarship"}
      </button>
      <div className="tag-row">
        {(scholarship.eligibility_json.tags || []).map((tag) => (
          <span key={tag}>{tag.replace(/_/g, " ")}</span>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function FitBadge({ score }: { score: number }) {
  const label = score >= 85 ? "Exceptional" : score >= 72 ? "Strong" : score >= 58 ? "Good" : "Possible";
  return (
    <div className="fit-badge">
      <b>{score}%</b>
      <span>{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="score-bar">
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </i>
      <em>{value}/{max}</em>
    </div>
  );
}

function scoreColleges(answers: Answers, collegeSet: College[]): ScoredCollege[] {
  return collegeSet.map((college) => ({ ...college, fit: computeFitScore(college, answers) })).sort(
    (a, b) => b.fit.total - a.fit.total,
  );
}

function computeFitScore(college: College, answers: Answers): ScoredCollege["fit"] {
  const userBudget = BUDGET[String(answers.annual_budget)] || 35000;
  const estimatedAid = INCOME_AID[String(answers.household_income)] || 5000;
  const effectiveCost = Math.max(0, college.netPrice - estimatedAid);
  const affordRatio = effectiveCost / Math.max(userBudget, 1);

  let affordability = affordRatio <= 0.7 ? 30 : affordRatio <= 1 ? 22 : affordRatio <= 1.3 ? 12 : 5;
  const studentSuccess =
    (college.gradRate >= 80 ? 13 : college.gradRate >= 65 ? 10 : college.gradRate >= 50 ? 7 : 4) +
    (college.retentionRate >= 90 ? 12 : college.retentionRate >= 80 ? 9 : college.retentionRate >= 70 ? 6 : 3);
  const outcomes = (college.earnings >= 55000 ? 10 : college.earnings >= 45000 ? 8 : 6) + 8;

  const selectivity = SELECTIVITY_BANDS[String(answers.selectivity_comfort)] || [0, 100];
  const admissions =
    college.admitRate >= selectivity[0] && college.admitRate <= selectivity[1]
      ? 15
      : Math.abs(college.admitRate - selectivity[0]) < 15 || Math.abs(college.admitRate - selectivity[1]) < 15
        ? 10
        : 5;

  const sizeBand = SIZE_BANDS[String(answers.size_pref)] || [0, 999999];
  const size = college.enrollment >= sizeBand[0] && college.enrollment <= sizeBand[1] ? 10 : 5;

  const homeState = STATES[String(answers.home_state)] || "";
  const preferredState = STATES[String(answers.preferred_state)] || "";
  if (homeState && college.state === homeState) {
    affordability = Math.min(30, affordability + 4);
  }
  if (preferredState && college.state === preferredState) {
    affordability = Math.min(30, affordability + 3);
  }

  const preferredTypes = Array.isArray(answers.institution_type) ? answers.institution_type : [];
  const hbcuBonus = college.hbcu && preferredTypes.includes("HBCU") ? 8 : 0;
  const technicalBonus =
    isTechnicalCollege(college) &&
    preferredTypes.some((type) =>
      [
        "Technical / Polytechnic",
        "Public state technical college",
        "Trade school / applied training",
        "Community or technical college transfer pathway",
      ].includes(type),
    )
      ? 7
      : 0;
  const total = Math.max(
    5,
    Math.min(99, affordability + studentSuccess + outcomes + admissions + size + hbcuBonus + technicalBonus),
  );

  return {
    total,
    affordability,
    studentSuccess,
    outcomes,
    admissions,
    size,
    effectiveCost,
  };
}

function isTechnicalCollege(college: College) {
  const name = college.name.toLowerCase();
  return (
    name.includes("technical") ||
    name.includes("technology") ||
    name.includes("polytechnic") ||
    name.includes("community college") ||
    name.includes("trade") ||
    name.includes("institute")
  );
}

function buildScholarshipQuery(answers: Answers, filters: ScholarshipFilters) {
  const params = new URLSearchParams();
  const major = normalizeMajor(String(answers.major));

  if (major) {
    params.append("majors", major);
  }
  params.set("gpa_band", gpaBand(Number(answers.gpa)));
  params.set("sat_score", String(Number(answers.test_score) || 0));
  params.set("act_score", String(Number(answers.act_score) || 0));
  if (filters.deadline_before) params.set("deadline_before", filters.deadline_before);
  if (filters.min_amount) params.set("min_amount", filters.min_amount);
  if (filters.min_fit) params.set("min_fit", filters.min_fit);
  params.set("limit", "25");

  return params;
}

function buildNativeScholarshipSearches(answers: Answers, filters: ScholarshipFilters) {
  const major = normalizeMajor(String(answers.major));
  const state = STATES[String(answers.preferred_state)] || STATES[String(answers.home_state)] || "";
  const tags = normalizeTags(answers);
  const searchTerms = [
    major,
    state ? `${state} scholarships` : "scholarships",
    gpaBand(Number(answers.gpa)),
    Number(answers.test_score) ? `SAT ${Number(answers.test_score)}` : "",
    Number(answers.act_score) ? `ACT ${Number(answers.act_score)}` : "",
    filters.deadline_before ? `deadline before ${filters.deadline_before}` : "",
    filters.min_amount ? `minimum $${filters.min_amount} scholarship` : "",
    ...tags.map((tag) => tag.replace(/_/g, " ")),
  ]
    .filter(Boolean)
    .join(" ");

  return SCHOLARSHIP_SEARCH_SOURCES.map((source) => ({
    ...source,
    searchUrl: nativeSearchUrl(source.url, searchTerms),
  }));
}

function nativeSearchUrl(baseUrl: string, searchTerms: string) {
  const encoded = encodeURIComponent(searchTerms);
  const url = new URL(baseUrl);

  if (baseUrl.includes("careeronestop.org")) {
    url.searchParams.set("keyword", searchTerms);
    return url.toString();
  }
  if (baseUrl.includes("bigfuture.collegeboard.org")) {
    url.searchParams.set("q", searchTerms);
    return url.toString();
  }
  if (baseUrl.includes("niche.com")) {
    url.searchParams.set("q", searchTerms);
    return url.toString();
  }
  if (baseUrl.includes("unigo.com")) {
    return `https://www.unigo.com/scholarships/search?keywords=${encoded}`;
  }
  if (baseUrl.includes("chegg.com")) {
    return `https://www.chegg.com/scholarships?search=${encoded}`;
  }
  if (baseUrl.includes("petersons.com")) {
    return `https://www.petersons.com/scholarship-search?search=${encoded}`;
  }
  if (baseUrl.includes("scholarships.com")) {
    return `https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory?query=${encoded}`;
  }
  if (baseUrl.includes("fastweb.com")) {
    return `https://www.fastweb.com/directory/scholarships?query=${encoded}`;
  }

  return baseUrl;
}

function buildCollegeQuery(answers: Answers) {
  const params = new URLSearchParams();
  const homeState = STATES[String(answers.home_state)];
  const preferredState = STATES[String(answers.preferred_state)];
  if (homeState) params.set("home_state", homeState);
  if (preferredState) params.set("preferred_state", preferredState);
  params.set("limit", "25");
  return params;
}

function normalizeMajor(major: string) {
  if (major.includes("STEM - Engineering")) return "STEM";
  if (major.includes("Life Sciences")) return "Health";
  if (major.includes("Health")) return "Health";
  if (major.includes("Arts")) return "Arts";
  if (major.includes("Business")) return "Business";
  if (major.includes("Agriculture")) return "Agriculture";
  if (major.includes("Trades")) return "Trades";
  return major === "Undecided" ? "Undecided" : major.split(" ")[0];
}

function normalizeTags(answers: Answers) {
  const flags = Array.isArray(answers.identity_flags) ? answers.identity_flags : [];
  const priorities = Array.isArray(answers.aid_priority) ? answers.aid_priority : [];
  const tags: string[] = [];
  if (flags.includes("First-generation college student")) tags.push("first_gen");
  if (flags.includes("Student of color")) tags.push("identity");
  if (flags.includes("Rural / Small-Town Background")) tags.push("rural");
  if (priorities.includes("Need-based grants")) tags.push("need_based");
  if (priorities.includes("Merit scholarships")) tags.push("merit");
  if ((answers.institution_type as string[])?.includes?.("HBCU")) tags.push("hbcu");
  return tags;
}

function gpaBand(gpa: number) {
  if (gpa >= 3.7) return "3.7+";
  if (gpa >= 3.3) return "3.3-3.69";
  if (gpa >= 3.0) return "3.0-3.29";
  return "below-3.0";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatAward(scholarship: Scholarship) {
  const min = scholarship.amount_min || 0;
  const max = scholarship.amount_max || min;
  if (!min && !max) return "Amount varies by source";
  if (min && !scholarship.amount_max) return `${formatCurrency(min)}+ target`;
  return min === max ? formatCurrency(max) : `${formatCurrency(min)}-${formatCurrency(max)}`;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export default App;
