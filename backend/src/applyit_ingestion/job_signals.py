"""Deterministic profile/job signals used for candidate-job matching.

Everything here is pure and dictionary-driven so the same functions derive
signals for stored jobs (at ingest) and for a candidate profile (at query).
"""

from __future__ import annotations

import html
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

INTERN, ENTRY, MID, SENIOR, STAFF, MANAGEMENT = range(6)
SENIORITY_LABELS = ("Internship", "Entry level", "Mid level", "Senior", "Staff+", "Management")

# Canonical skill -> case-insensitive alias patterns. Aliases are matched on
# token boundaries so "go" does not match "good" and "c" does not match "cloud".
SKILLS: dict[str, tuple[str, ...]] = {
    "Python": ("python",),
    "Java": ("java",),
    "JavaScript": ("javascript", "ecmascript", "js"),
    "TypeScript": ("typescript",),
    "Go": ("golang", r"go(?= (?:language|developer|services|microservices))", r"go(?=,)"),
    "Rust": ("rust",),
    "C": (r"c(?= (?:programming|language|/c\+\+))", r"c(?=,\s*c\+\+)"),
    "C++": (r"c\+\+", "cpp"),
    "C#": (r"c#", "csharp"),
    ".NET": (r"\.net", "dotnet", r"asp\.net"),
    "Kotlin": ("kotlin",),
    "Swift": ("swift",),
    "Objective-C": ("objective-c",),
    "Scala": ("scala",),
    "Ruby": ("ruby",),
    "Ruby on Rails": ("rails", "ruby on rails"),
    "PHP": ("php",),
    "R": (r"r(?= (?:programming|language|studio))", "rstudio"),
    "MATLAB": ("matlab",),
    "SQL": ("sql", "t-sql", "pl/sql"),
    "Bash": ("bash", "shell scripting"),
    "React": ("react", r"react\.js", "reactjs"),
    "React Native": ("react native",),
    "Next.js": (r"next\.js", "nextjs"),
    "Angular": ("angular", "angularjs"),
    "Vue": ("vue", r"vue\.js", "vuejs"),
    "Svelte": ("svelte",),
    "Node.js": (r"node\.js", "nodejs"),
    "Express": (r"express\.js", "expressjs"),
    "Django": ("django",),
    "Flask": ("flask",),
    "FastAPI": ("fastapi",),
    "Spring": ("spring boot", "spring framework", "spring mvc"),
    "GraphQL": ("graphql",),
    "REST APIs": ("restful", "rest apis?", "rest services"),
    "gRPC": ("grpc",),
    "HTML": ("html", "html5"),
    "CSS": ("css", "css3", "tailwind", "sass", "scss"),
    "PostgreSQL": ("postgresql", "postgres"),
    "MySQL": ("mysql",),
    "MongoDB": ("mongodb", "mongo"),
    "Redis": ("redis",),
    "Elasticsearch": ("elasticsearch", "opensearch"),
    "Cassandra": ("cassandra",),
    "DynamoDB": ("dynamodb",),
    "Snowflake": ("snowflake",),
    "BigQuery": ("bigquery",),
    "Kafka": ("kafka",),
    "Spark": ("spark", "pyspark", "apache spark"),
    "Hadoop": ("hadoop",),
    "Airflow": ("airflow",),
    "dbt": ("dbt",),
    "ETL": ("etl", "elt", "data pipelines?"),
    "AWS": ("aws", "amazon web services", "ec2", "s3", "lambda"),
    "GCP": ("gcp", "google cloud"),
    "Azure": ("azure",),
    "Docker": ("docker", "containeri[sz]ation"),
    "Kubernetes": ("kubernetes", "k8s", "eks", "gke", "aks"),
    "Terraform": ("terraform",),
    "CI/CD": ("ci/cd", "continuous integration", "github actions", "jenkins", "gitlab ci"),
    "Linux": ("linux", "unix"),
    "Git": ("git",),
    "Microservices": ("microservices?", "distributed systems"),
    "Machine Learning": ("machine learning", "ml"),
    "Deep Learning": ("deep learning", "neural networks?"),
    "LLMs": ("llms?", "large language models?", "generative ai", "genai", "rag"),
    "NLP": ("nlp", "natural language processing"),
    "Computer Vision": ("computer vision", "opencv"),
    "PyTorch": ("pytorch", "torch"),
    "TensorFlow": ("tensorflow", "keras"),
    "scikit-learn": ("scikit-learn", "sklearn"),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "Statistics": ("statistics", "statistical modeling", "a/b testing"),
    "Tableau": ("tableau",),
    "Power BI": ("power bi", "powerbi"),
    "Excel": (
        "microsoft excel",
        "ms excel",
        "advanced excel",
        "excel (?:vba|macros|formulas|spreadsheets)",
    ),
    "Looker": ("looker",),
    "Figma": ("figma",),
    "iOS": ("ios",),
    "Android": ("android",),
    "Embedded": (
        "embedded systems?",
        "embedded c",
        "embedded software",
        "firmware",
        "rtos",
        "microcontrollers?",
    ),
    "Verilog": ("verilog", "systemverilog", "vhdl", "rtl"),
    "FPGA": ("fpga",),
    "PLC": ("plc", "scada"),
    "Security": ("cybersecurity", "application security", "penetration testing", "siem"),
    "Salesforce": ("salesforce",),
    "SAP": ("sap",),
    "Jira": ("jira",),
    "Agile": ("agile", "scrum"),
}

# Role families are coarse job functions. A title can belong to several
# ("Software Engineer, Applied ML" is both software and ml).
ROLE_FAMILIES: dict[str, tuple[str, ...]] = {
    "software": (
        r"software",
        r"developer",
        r"programmer",
        r"sde",
        r"swe",
        r"full[- ]?stack",
        r"front[- ]?end",
        r"back[- ]?end",
        r"web engineer",
        r"mobile engineer",
        r"ios engineer",
        r"android engineer",
        r"devops",
        r"site reliability",
        r"sre",
        r"platform engineer",
        r"infrastructure engineer",
        r"cloud engineer",
        r"product engineer",
        r"application engineer",
        r"ui engineer",
        r"member of technical staff",
        r"forward deployed engineer",
        r"api engineer",
        r"systems? software",
        r"sdet",
        r"qa engineer",
        r"test (?:automation|development) engineer",
        r"mlops",
        r"system administrator",
        r"sysadmin",
        r"systems? engineer(?:ing)?",
        r"systems analyst",
    ),
    "ml": (
        r"machine learning",
        r"ml",
        r"ai engineer",
        r"ai/ml",
        r"deep learning",
        r"data scientist",
        r"applied scientist",
        r"research scientist",
        r"research engineer",
        r"computer vision",
        r"nlp",
        r"llm",
        r"inferencing",
        r"inference",
        r"mlops",
        r"ai comput(?:e|ing)",
        r"tensorrt",
        r"hpc",
        r"gpu",
    ),
    "data": (
        r"data engineer",
        r"analytics engineer",
        r"data analyst",
        r"business intelligence",
        r"bi (?:developer|engineer|analyst)",
        r"data platform",
        r"database",
        r"etl",
        r"analytics",
    ),
    "security": (r"security", r"cyber", r"penetration", r"soc analyst", r"appsec"),
    "hardware": (
        r"hardware",
        r"asic",
        r"fpga",
        r"rtl",
        r"silicon",
        r"soc",
        r"sram",
        r"dft",
        r"verification",
        r"circuit",
        r"analog",
        r"mixed[- ]signal",
        r"layout",
        r"physical design",
        r"chip",
        r"embedded",
        r"firmware",
        r"electrical",
        r"dfx",
        r"power analysis",
        r"data center engineer",
        r"thermal",
        r"mechanical",
        r"instrumentation",
        r"controls? engineer",
        r"automation engineer",
        r"plc",
    ),
    "design": (r"designer", r"ux", r"ui", r"user experience", r"design lead"),
    "product": (r"product manager", r"product owner", r"product lead", r"head of product"),
    "program": (r"program manager", r"project manager", r"technical program", r"scrum master"),
    "sales": (
        r"sales",
        r"account executive",
        r"account manager",
        r"business development",
        r"sdr",
        r"bdr",
        r"solutions engineer",
        r"pre-?sales",
        r"partnerships?",
    ),
    "marketing": (r"marketing", r"growth", r"seo", r"aeo", r"content", r"brand", r"communications"),
    "support": (r"customer success", r"support", r"implementation", r"onboarding specialist"),
    "people": (r"recruit", r"talent", r"people", r"human resources", r"hr", r"hrbp"),
    "finance": (
        r"finance",
        r"financial analyst",
        r"accountant",
        r"accounting",
        r"payroll",
        r"tax",
        r"fp&a",
        r"treasury",
        r"controller",
        r"audit",
    ),
    "legal": (r"legal", r"counsel", r"attorney", r"paralegal", r"compliance", r"aml"),
    "operations": (r"operations", r"ops", r"logistics", r"supply chain", r"fraud"),
}

_US_STATES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "DC": "District of Columbia",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
}

# Country code -> names and major hiring cities that appear without a country.
COUNTRIES: dict[str, tuple[str, ...]] = {
    "US": (
        "united states",
        "united states of america",
        "usa",
        "u.s.",
        "u.s.a.",
        "us",
        "america",
        *(name.casefold() for name in _US_STATES.values() if name != "Georgia"),
        "san francisco",
        "new york",
        "nyc",
        "seattle",
        "austin",
        "boston",
        "chicago",
        "los angeles",
        "san jose",
        "santa clara",
        "sunnyvale",
        "mountain view",
        "palo alto",
        "menlo park",
        "redmond",
        "bellevue",
        "denver",
        "atlanta",
        "miami",
        "dallas",
        "houston",
        "san diego",
        "portland",
        "pittsburgh",
        "philadelphia",
        "phoenix",
        "salt lake city",
        "raleigh",
        "ames",
        "des moines",
        "minneapolis",
        "detroit",
        "sf",
    ),
    "CA": (
        "canada",
        "toronto",
        "vancouver",
        "montreal",
        "montréal",
        "ottawa",
        "calgary",
        "waterloo",
        "ontario",
        "british columbia",
        "quebec",
        "alberta",
    ),
    "GB": (
        "united kingdom",
        "uk",
        "england",
        "scotland",
        "wales",
        "london",
        "manchester",
        "edinburgh",
        "cambridge, uk",
        "great britain",
    ),
    "IE": ("ireland", "dublin"),
    "IN": (
        "india",
        "bengaluru",
        "bangalore",
        "hyderabad",
        "pune",
        "chennai",
        "mumbai",
        "new delhi",
        "delhi",
        "gurgaon",
        "gurugram",
        "noida",
        "kolkata",
        "tamil nadu",
    ),
    "DE": ("germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt"),
    "FR": ("france", "paris"),
    "NL": ("netherlands", "amsterdam"),
    "ES": ("spain", "madrid", "barcelona"),
    "PT": ("portugal", "lisbon"),
    "IT": ("italy", "milan", "rome"),
    "BE": ("belgium", "brussels"),
    "CH": ("switzerland", "zurich", "zürich", "geneva"),
    "SE": ("sweden", "stockholm"),
    "PL": ("poland", "warsaw", "kraków", "krakow"),
    "TR": ("türkiye", "turkey", "istanbul", "i̇stanbul"),
    "IL": ("israel", "tel aviv"),
    "AE": ("united arab emirates", "uae", "dubai", "abu dhabi"),
    "SG": ("singapore",),
    "JP": ("japan", "tokyo"),
    "KR": ("south korea", "korea", "seoul"),
    "CN": ("china", "shanghai", "beijing", "shenzhen"),
    "TW": ("taiwan", "taipei"),
    "HK": ("hong kong",),
    "AU": ("australia", "sydney", "melbourne"),
    "NZ": ("new zealand", "auckland"),
    "BR": ("brazil", "brasil", "são paulo", "sao paulo"),
    "MX": ("mexico", "méxico", "mexico city"),
    "AR": ("argentina", "buenos aires"),
    "CO": ("colombia", "bogotá", "bogota"),
    "PH": ("philippines", "manila"),
    "VN": ("vietnam",),
    "SA": ("saudi arabia", "riyadh"),
    "ZA": ("south africa", "johannesburg", "cape town"),
    "TH": ("thailand", "bangkok"),
    "NG": ("nigeria", "lagos"),
    "MY": ("malaysia", "kuala lumpur"),
    "DK": ("denmark", "copenhagen"),
    "EG": ("egypt", "cairo"),
    "UA": ("ukraine", "kyiv"),
    "FI": ("finland", "helsinki"),
    "NO": ("norway", "oslo"),
    "AT": ("austria", "vienna"),
    "CZ": ("czech republic", "czechia", "prague"),
    "RO": ("romania", "bucharest"),
    "ID": ("indonesia", "jakarta"),
}
_COUNTRY_ALIASES = {
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "us": "US",
    "canada": "CA",
    "united kingdom": "GB",
    "uk": "GB",
    "india": "IN",
    "germany": "DE",
    "ireland": "IE",
    "singapore": "SG",
    "australia": "AU",
}


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", value).strip()


def _alternation(aliases: Iterable[str]) -> re.Pattern[str]:
    body = "|".join(f"(?:{alias})" for alias in aliases)
    return re.compile(rf"(?<![\w+#.-])(?:{body})(?![\w+#-])", re.IGNORECASE)


_SKILL_PATTERNS = {skill: _alternation(aliases) for skill, aliases in SKILLS.items()}
_FAMILY_PATTERNS = {family: _alternation(aliases) for family, aliases in ROLE_FAMILIES.items()}
_COUNTRY_PATTERNS = {
    code: re.compile(r"(?<!\w)(?:" + "|".join(re.escape(name) for name in names) + r")(?!\w)")
    for code, names in COUNTRIES.items()
}
_US_STATE_CODE = re.compile(r"(?:^|[,(\s-])(?:" + "|".join(_US_STATES) + r")(?=$|[,)\s-])")
_TAG = re.compile(r"<[^>]+>")


def plain_text(value: str | None) -> str:
    if not value:
        return ""
    text = html.unescape(html.unescape(value))
    return re.sub(r"\s+", " ", _TAG.sub(" ", text)).strip()


def extract_skills(text: str | None) -> list[str]:
    content = plain_text(text)
    if not content:
        return []
    return sorted(skill for skill, pattern in _SKILL_PATTERNS.items() if pattern.search(content))


def role_families(title: str | None) -> list[str]:
    if not title:
        return []
    normalized = _normalize(title)
    return sorted(
        family for family, pattern in _FAMILY_PATTERNS.items() if pattern.search(normalized)
    )


_INTERN = re.compile(r"\b(?:intern|internship|co-?op|apprentice(?:ship)?|trainee|student)\b")
_MANAGEMENT = re.compile(
    r"\b(?:director|head of|vice president|vp|svp|evp|chief|cto|cfo|ceo|coo|cio|"
    r"engineering manager|manager,? (?:software )?engineering|senior manager|sr\.? manager|"
    r"group manager|general manager|manager of|people manager)\b"
)
_STAFF = re.compile(
    r"\b(?:staff|principal|distinguished|fellow|architect|lead|tech lead|iv|v|l6|l7|e6|e7)\b"
)
_SENIOR = re.compile(r"\b(?:senior|sr\.?|iii|l5|e5)\b")
_MID = re.compile(r"\b(?:ii|mid(?:-level)?|intermediate|l4|e4)\b")
_ENTRY = re.compile(
    r"\b(?:junior|jr\.?|entry(?:-level| level)?|new grad(?:uate)?|graduate|early career|"
    r"associate|university grad|i|l3|e3)\b"
)


def seniority(title: str | None) -> int | None:
    if not title:
        return None
    normalized = _normalize(title)
    for level, pattern in (
        (INTERN, _INTERN),
        (MANAGEMENT, _MANAGEMENT),
        (STAFF, _STAFF),
        (SENIOR, _SENIOR),
        (MID, _MID),
        (ENTRY, _ENTRY),
    ):
        if pattern.search(normalized):
            return level
    return None


_YEARS = re.compile(
    r"(?<![\d.])(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b"
    r"(?=[^.;\n]{0,60}\b(?:experience|industry|professional|working|building|developing)\b)",
    re.IGNORECASE,
)


def min_years_required(description: str | None) -> int | None:
    """Largest explicit "N+ years … experience" requirement in a description."""
    values = [int(match.group(1)) for match in _YEARS.finditer(plain_text(description))]
    values = [value for value in values if 0 < value <= 20]
    return max(values) if values else None


_NO_SPONSORSHIP = re.compile(
    r"(?:(?:not|unable to|cannot|can't|can not|won't|will not|does not|do not|doesn't|don't)"
    r"\s+(?:be\s+able\s+to\s+)?(?:offer|provide|sponsor|support)[^.]{0,40}"
    r"(?:sponsor|visa|work authori[sz]ation)"
    r"|without (?:the )?(?:need for |requiring )?(?:current or future )?(?:visa )?sponsorship"
    r"|no (?:visa )?sponsorship"
    r"|sponsorship (?:is )?not (?:available|offered|provided)"
    r"|must be (?:a )?(?:us|u\.s\.) citizen"
    r"|(?:us|u\.s\.) citizenship (?:is )?required"
    r"|security clearance (?:is )?required)",
    re.IGNORECASE,
)


def excludes_sponsorship(description: str | None) -> bool:
    return bool(_NO_SPONSORSHIP.search(plain_text(description)))


def countries(location: str | None) -> list[str]:
    if not location:
        return []
    normalized = _normalize(location)
    found = {code for code, pattern in _COUNTRY_PATTERNS.items() if pattern.search(normalized)}
    # Two-letter state codes collide with country codes ("IN", "CA"), so they
    # only count when no country was named explicitly.
    if not found and _US_STATE_CODE.search(location):
        found.add("US")
    return sorted(found)


def country_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = _normalize(value)
    if normalized in _COUNTRY_ALIASES:
        return _COUNTRY_ALIASES[normalized]
    matched = countries(value)
    return matched[0] if len(matched) == 1 else None


@dataclass(frozen=True, slots=True)
class JobSignals:
    skills: list[str]
    role_families: list[str]
    seniority: int | None
    min_years: int | None
    countries: list[str]
    no_sponsorship: bool

    def as_record(self) -> dict[str, object]:
        return {
            "skills": self.skills,
            "role_families": self.role_families,
            "seniority": self.seniority,
            "min_years": self.min_years,
            "countries": self.countries,
            "no_sponsorship": self.no_sponsorship,
        }

    @classmethod
    def derive(cls, title: str, location: str | None, description: str | None) -> JobSignals:
        text = f"{title}\n{plain_text(description)}"
        return cls(
            skills=extract_skills(text),
            role_families=role_families(title),
            seniority=seniority(title),
            min_years=min_years_required(description),
            countries=countries(location),
            no_sponsorship=excludes_sponsorship(description),
        )


def acceptable_seniority(years: float | None, titles: Iterable[str]) -> list[int]:
    """Seniority bands a candidate can realistically apply for."""
    levels = [level for level in (seniority(title) for title in titles) if level is not None]
    if years is None:
        top = max(levels, default=MID)
        return sorted({INTERN, ENTRY, MID, top, min(top + 1, MANAGEMENT)})
    if years < 1:
        bands = {INTERN, ENTRY}
    elif years < 3:
        bands = {INTERN, ENTRY, MID}
    elif years < 6:
        bands = {ENTRY, MID, SENIOR}
    elif years < 9:
        bands = {MID, SENIOR, STAFF}
    else:
        bands = {SENIOR, STAFF}
    if MANAGEMENT in levels or (years is not None and years >= 8 and STAFF in levels):
        bands.add(MANAGEMENT)
    return sorted(bands)


def parse_years(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:\.\d+)?", value)
    return float(match.group()) if match else None
