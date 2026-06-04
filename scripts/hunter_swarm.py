"""
CAID Hunter Swarm — 3-Tier Agentic Pipeline
============================================
Agent 1 (Navigator):   Tavily search → finds exact leadership page URL
Agent 2 (Scraper):     Tavily extract → pulls raw markdown from that URL
Agent 3 (Interrogator): LLM structured call → extracts full executive profiles

Keys injected at runtime via environment or constants below.
"""

import os
import json
import time
import re
import csv
import requests
import pandas as pd
from dataclasses import dataclass, asdict
from typing import Optional, List
from pathlib import Path

# ─── API KEYS ────────────────────────────────────────────────────────────────
TAVILY_KEY   = "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"
DIFFBOT_TOKEN = "a70dd1af6e654f5dbb12f3cd2d1406bb"
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# Best available non-rate-limited model
LLM_MODEL = "openai/gpt-oss-120b:free"

# ─── DATA SCHEMA ─────────────────────────────────────────────────────────────
@dataclass
class ExecutiveProfile:
    executive_name: str
    exact_title: str
    biography_snippet: str
    linkedin_url: str
    contact_info: str
    confidence: str          # HIGH / MEDIUM / LOW
    source_url: str
    extraction_method: str   # tavily_extract / diffbot / llm_knowledge


@dataclass
class OrgEnrichment:
    org_id: str
    org_name: str
    ceo: Optional[ExecutiveProfile] = None
    cso: Optional[ExecutiveProfile] = None
    head_of_grants: Optional[ExecutiveProfile] = None
    board_chair: Optional[ExecutiveProfile] = None
    raw_page_text: str = ""
    leadership_url: str = ""
    error: str = ""


# ─── AGENT 1: NAVIGATOR ──────────────────────────────────────────────────────
def agent_navigator(org_name: str, website: str, country: str) -> dict:
    """
    Uses Tavily search to find the exact leadership/about page URL.
    Returns: {url, title, snippet, confidence}
    """
    queries = [
        f'site:{website} leadership OR "executive team" OR "board of directors" OR CEO',
        f'"{org_name}" CEO "executive director" leadership team 2024 2025',
        f'"{org_name}" {country} chief executive officer annual report',
    ]
    
    for query in queries:
        try:
            resp = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_KEY,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 5,
                    "include_domains": [website] if '.' in website else [],
                    "include_answer": True,
                },
                timeout=15
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                
                # Score results: prefer org's own domain, leadership-related paths
                for r in results:
                    url = r.get("url", "")
                    title = r.get("title", "").lower()
                    content = r.get("content", "")
                    
                    # Check if this looks like a leadership page
                    leadership_signals = any(kw in url.lower() or kw in title for kw in 
                        ['leadership', 'team', 'about', 'staff', 'governance', 'board', 'executive', 'who-we-are'])
                    
                    if leadership_signals and (website in url or org_name.split()[0].lower() in url.lower()):
                        return {
                            "url": url,
                            "title": r.get("title", ""),
                            "snippet": content[:500],
                            "confidence": "HIGH",
                            "answer": data.get("answer", ""),
                            "query_used": query
                        }
                
                # Fallback: return best result even if not leadership-specific
                if results:
                    best = results[0]
                    return {
                        "url": best.get("url", ""),
                        "title": best.get("title", ""),
                        "snippet": best.get("content", "")[:500],
                        "confidence": "MEDIUM",
                        "answer": data.get("answer", ""),
                        "query_used": query
                    }
            elif resp.status_code == 429:
                time.sleep(5)
                continue
                
        except Exception as e:
            continue
        
        time.sleep(0.5)
    
    return {"url": "", "confidence": "FAILED", "error": "No results found"}


# ─── AGENT 2: SCRAPER ────────────────────────────────────────────────────────
def agent_scraper(url: str, org_name: str) -> dict:
    """
    Uses Tavily extract to pull full page content, with Diffbot as fallback.
    Returns: {text, markdown, source}
    """
    if not url:
        return {"text": "", "source": "none", "error": "No URL provided"}
    
    # Method 1: Tavily Extract
    try:
        resp = requests.post(
            "https://api.tavily.com/extract",
            json={
                "api_key": TAVILY_KEY,
                "urls": [url],
            },
            timeout=20
        )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if results and results[0].get("raw_content"):
                text = results[0]["raw_content"]
                if len(text) > 200:
                    return {"text": text, "source": "tavily_extract", "url": url}
    except Exception:
        pass
    
    # Method 2: Diffbot Article API
    try:
        resp = requests.get(
            "https://api.diffbot.com/v3/article",
            params={
                "token": DIFFBOT_TOKEN,
                "url": url,
                "fields": "text,title,author,authorUrl",
            },
            timeout=20
        )
        if resp.status_code == 200:
            data = resp.json()
            objects = data.get("objects", [])
            if objects:
                text = objects[0].get("text", "")
                if len(text) > 200:
                    return {"text": text, "source": "diffbot", "url": url}
    except Exception:
        pass
    
    # Method 3: Diffbot Analyze (handles JS-heavy pages)
    try:
        resp = requests.get(
            "https://api.diffbot.com/v3/analyze",
            params={
                "token": DIFFBOT_TOKEN,
                "url": url,
                "fields": "text,title,links",
            },
            timeout=25
        )
        if resp.status_code == 200:
            data = resp.json()
            objects = data.get("objects", [])
            if objects:
                text = objects[0].get("text", "")
                if len(text) > 200:
                    return {"text": text, "source": "diffbot_analyze", "url": url}
    except Exception:
        pass
    
    # Method 4: Direct requests fallback
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        }
        resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        if resp.status_code == 200 and len(resp.text) > 500:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                tag.decompose()
            text = soup.get_text(separator='\n', strip=True)
            if len(text) > 200:
                return {"text": text, "source": "direct_scrape", "url": url}
    except Exception:
        pass
    
    return {"text": "", "source": "failed", "error": f"All extraction methods failed for {url}"}


# ─── AGENT 3: INTERROGATOR ───────────────────────────────────────────────────
def agent_interrogator(page_text: str, org_name: str, website: str, 
                        country: str, cancer_focus: str, 
                        tavily_answer: str = "") -> dict:
    """
    Structured LLM call that extracts full executive profiles from page text.
    Uses Zod-style schema enforcement via JSON mode.
    """
    
    # Truncate page text to fit context
    text_excerpt = page_text[:4000] if page_text else ""
    answer_context = f"\nTavily direct answer: {tavily_answer}" if tavily_answer else ""
    
    prompt = f"""You are extracting executive leadership data from a cancer advocacy organization's website.

Organization: {org_name}
Website: {website}
Country: {country}
Cancer Focus: {cancer_focus}
{answer_context}

Page content extracted from their website:
---
{text_excerpt}
---

Extract ALL executive profiles you can find. For each person, extract:
- executive_name: Full name (e.g. "Sarah Johnson")
- exact_title: Their exact job title as written on the page
- biography_snippet: 1-2 sentence summary of their background/focus (from the page)
- linkedin_url: LinkedIn URL if mentioned, otherwise "Not listed"
- contact_info: Any email or contact info listed, otherwise "Not listed"
- role_category: One of: CEO_ED / CSO_RESEARCH / GRANTS / BOARD_CHAIR / OTHER

IMPORTANT:
- Only extract names that APPEAR IN THE PAGE TEXT above
- Do not invent or guess names not present in the text
- If no names are found in the text, return empty executives array
- Prefer the CEO/Executive Director above all others

Respond ONLY in this exact JSON (no markdown, no explanation):
{{
  "executives": [
    {{
      "executive_name": "Full Name",
      "exact_title": "Chief Executive Officer",
      "biography_snippet": "Brief bio from page",
      "linkedin_url": "linkedin.com/in/slug or Not listed",
      "contact_info": "email@org.org or Not listed",
      "role_category": "CEO_ED",
      "confidence": "HIGH"
    }}
  ],
  "page_quality": "RICH/PARTIAL/EMPTY",
  "extraction_notes": "brief note"
}}"""

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 1000,
            },
            timeout=45
        )
        if resp.status_code == 200:
            content = resp.json()['choices'][0]['message']['content'].strip()
            # Strip thinking tags
            if '</think>' in content:
                content = content[content.rfind('</think>')+8:].strip()
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        elif resp.status_code == 429:
            time.sleep(15)
            # One retry
            resp2 = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}", "Content-Type": "application/json"},
                json={"model": LLM_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "max_tokens": 1000},
                timeout=45
            )
            if resp2.status_code == 200:
                content = resp2.json()['choices'][0]['message']['content'].strip()
                if '</think>' in content:
                    content = content[content.rfind('</think>')+8:].strip()
                start = content.find('{')
                end = content.rfind('}') + 1
                if start >= 0 and end > start:
                    return json.loads(content[start:end])
    except Exception as e:
        pass
    
    return {"executives": [], "page_quality": "FAILED", "extraction_notes": "LLM call failed"}


# ─── LINKEDIN HUNTER ─────────────────────────────────────────────────────────
def hunt_linkedin(name: str, org_name: str) -> str:
    """Secondary Tavily search specifically for LinkedIn URL."""
    if not name or name == "Unknown":
        return "Not found"
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_KEY,
                "query": f'"{name}" "{org_name}" site:linkedin.com/in',
                "max_results": 3,
                "include_domains": ["linkedin.com"],
            },
            timeout=10
        )
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            for r in results:
                url = r.get("url", "")
                if "linkedin.com/in/" in url:
                    # Extract clean slug
                    slug = url.split("linkedin.com/in/")[1].split("/")[0].split("?")[0]
                    return f"linkedin.com/in/{slug}"
    except Exception:
        pass
    return "Not found"


# ─── MAIN SWARM ORCHESTRATOR ─────────────────────────────────────────────────
def run_swarm(org_id: str, org_name: str, website: str, country: str, 
              cancer_focus: str, verbose: bool = True) -> OrgEnrichment:
    """
    Runs the full 3-tier pipeline for one org.
    Returns OrgEnrichment with all extracted profiles.
    """
    result = OrgEnrichment(org_id=org_id, org_name=org_name)
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"[SWARM] {org_id}: {org_name}")
        print(f"{'='*60}")
    
    # ── AGENT 1: NAVIGATE ──
    if verbose: print(f"  [A1-NAVIGATOR] Searching for leadership page...")
    nav = agent_navigator(org_name, website, country)
    
    if nav.get("confidence") == "FAILED":
        result.error = "Navigator failed to find any URL"
        if verbose: print(f"  [A1] FAILED: {nav.get('error')}")
        # Still try interrogator with empty text + org knowledge
    else:
        result.leadership_url = nav.get("url", "")
        if verbose: print(f"  [A1] Found: {result.leadership_url[:80]}")
        if verbose and nav.get("answer"): print(f"  [A1] Tavily answer: {nav['answer'][:150]}")
    
    # ── AGENT 2: SCRAPE ──
    if result.leadership_url:
        if verbose: print(f"  [A2-SCRAPER] Extracting page content...")
        scrape = agent_scraper(result.leadership_url, org_name)
        result.raw_page_text = scrape.get("text", "")
        if verbose: print(f"  [A2] Method: {scrape.get('source')} | Text length: {len(result.raw_page_text)} chars")
    
    # ── AGENT 3: INTERROGATE ──
    if verbose: print(f"  [A3-INTERROGATOR] Extracting executive profiles...")
    interrogation = agent_interrogator(
        result.raw_page_text, org_name, website, country, cancer_focus,
        tavily_answer=nav.get("answer", "") if nav else ""
    )
    
    executives = interrogation.get("executives", [])
    page_quality = interrogation.get("page_quality", "UNKNOWN")
    if verbose: print(f"  [A3] Page quality: {page_quality} | Executives found: {len(executives)}")
    
    # Map executives to roles
    for exec_data in executives:
        role = exec_data.get("role_category", "OTHER")
        name = exec_data.get("executive_name", "")
        
        # Hunt LinkedIn if not already found
        linkedin = exec_data.get("linkedin_url", "Not listed")
        if linkedin == "Not listed" and name and len(name.split()) >= 2:
            linkedin = hunt_linkedin(name, org_name)
            exec_data["linkedin_url"] = linkedin
            time.sleep(0.3)
        
        profile = ExecutiveProfile(
            executive_name=name,
            exact_title=exec_data.get("exact_title", ""),
            biography_snippet=exec_data.get("biography_snippet", ""),
            linkedin_url=linkedin,
            contact_info=exec_data.get("contact_info", "Not listed"),
            confidence=exec_data.get("confidence", "MEDIUM"),
            source_url=result.leadership_url,
            extraction_method=f"tavily+llm"
        )
        
        if role == "CEO_ED" and result.ceo is None:
            result.ceo = profile
            if verbose: print(f"  [A3] CEO: {name} ({exec_data.get('exact_title')}) [{profile.confidence}]")
        elif role == "CSO_RESEARCH" and result.cso is None:
            result.cso = profile
            if verbose: print(f"  [A3] CSO: {name} ({exec_data.get('exact_title')})")
        elif role == "GRANTS" and result.head_of_grants is None:
            result.head_of_grants = profile
            if verbose: print(f"  [A3] Grants: {name} ({exec_data.get('exact_title')})")
        elif role == "BOARD_CHAIR" and result.board_chair is None:
            result.board_chair = profile
            if verbose: print(f"  [A3] Board: {name} ({exec_data.get('exact_title')})")
    
    if not executives:
        if verbose: print(f"  [A3] No executives extracted from page")
    
    return result


# ─── CSV UPDATER ─────────────────────────────────────────────────────────────
def update_csv(enrichments: List[OrgEnrichment], csv_path: str):
    """Updates the enriched CSV with swarm results."""
    df = pd.read_csv(csv_path)
    
    updated = 0
    for enr in enrichments:
        mask = df['Org_ID'] == enr.org_id
        if not mask.any():
            continue
        
        if enr.ceo:
            df.loc[mask, 'CEO_Executive_Director'] = enr.ceo.executive_name + f" ({enr.ceo.exact_title})"
            if enr.ceo.linkedin_url and enr.ceo.linkedin_url not in ("Not listed", "Not found"):
                df.loc[mask, 'LinkedIn_CEO'] = enr.ceo.linkedin_url
            updated += 1
        
        if enr.cso:
            df.loc[mask, 'CSO_Head_of_Research'] = enr.cso.executive_name + f" ({enr.cso.exact_title})"
        
        if enr.head_of_grants:
            df.loc[mask, 'Head_of_Grants'] = enr.head_of_grants.executive_name + f" ({enr.head_of_grants.exact_title})"
        
        if enr.board_chair:
            df.loc[mask, 'Board_Chair'] = enr.board_chair.executive_name + f" ({enr.board_chair.exact_title})"
    
    df.to_csv(csv_path, index=False)
    print(f"\n[CSV] Updated {updated}/{len(enrichments)} orgs in {csv_path}")
    return df


if __name__ == "__main__":
    print("Hunter Swarm module loaded. Run via run_swarm_batch() or import.")
