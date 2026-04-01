"""
Website-Test für moneta-invest.de mit browser-use
Ausführen: python browser_test.py
Voraussetzungen: pip install browser-use playwright && playwright install chromium
Umgebungsvariable: ANTHROPIC_API_KEY muss gesetzt sein
"""

import asyncio
import os
from langchain_anthropic import ChatAnthropic
from browser_use import Agent, Browser, BrowserConfig

WEBSITE = "https://www.moneta-invest.de"

TASK = f"""
Du bist ein Website-Tester. Teste die Website {WEBSITE} gründlich und erstelle einen detaillierten Fehlerbericht.

Führe folgende Tests durch:

1. **Homepage laden**
   - Öffne {WEBSITE}
   - Prüfe ob die Seite korrekt lädt (kein Fehler, kein weißes Bild, kein 404)
   - Notiere den Seitentitel und die Hauptüberschrift

2. **Navigation Header**
   - Klicke jeden Link im Header-Menü an
   - Prüfe ob die Zielseite korrekt lädt
   - Notiere alle Links die nicht funktionieren oder 404 zurückgeben
   - Gehe nach jedem Klick zurück zur Homepage

3. **Navigation Footer**
   - Scrolle zum Footer
   - Klicke jeden Link im Footer an
   - Notiere alle defekten Links

4. **Call-to-Action Buttons**
   - Finde alle prominenten Buttons (z.B. "Jetzt starten", "Registrieren", "Login", "Kostenlos testen" etc.)
   - Klicke jeden Button an und prüfe ob er zur richtigen Seite führt

5. **Login-Formular** (falls vorhanden)
   - Navigiere zur Login-Seite
   - Prüfe ob alle Formularfelder vorhanden und klickbar sind
   - Versuche mit leeren Feldern abzusenden und prüfe ob Fehlermeldungen erscheinen
   - Versuche mit ungültiger E-Mail (test@test) und prüfe die Validierung

6. **Registrierungs-Formular** (falls vorhanden)
   - Navigiere zur Registrierungsseite
   - Prüfe alle Felder und Validierungen
   - Teste mit leeren Feldern

7. **Interaktive Elemente**
   - Prüfe ob Dropdowns/Akkordeons öffnen
   - Prüfe ob Tabs funktionieren
   - Prüfe ob Modals/Popups schließbar sind

8. **Mobile-Ansicht** (optional)
   - Prüfe ob die Seite responsive ist

Erstelle am Ende einen strukturierten Bericht in folgendem Format:

---
## TESTERGEBNIS: moneta-invest.de

### ✅ Funktioniert korrekt:
- [Liste der funktionierenden Features]

### ❌ Fehler gefunden:
- [Fehlerbeschreibung + betroffene URL/Element]

### ⚠️ Warnungen / Auffälligkeiten:
- [Kleinere Probleme oder Verbesserungsvorschläge]

### 📊 Zusammenfassung:
- Getestete Links: X
- Fehlerhafte Links: X
- Getestete Formulare: X
- Fehlerhafte Formulare: X
---

Sei sehr präzise bei den Fehlerbeschreibungen und nenne immer die betroffene URL.
"""


async def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("FEHLER: ANTHROPIC_API_KEY ist nicht gesetzt!")
        print("Setze die Variable: set ANTHROPIC_API_KEY=dein-key (Windows)")
        return

    llm = ChatAnthropic(
        model="claude-sonnet-4-6",
        api_key=api_key,
        timeout=120,
        max_tokens=8192,
    )

    browser = Browser(
        config=BrowserConfig(
            headless=False,  # Auf True setzen für unsichtbaren Browser
        )
    )

    agent = Agent(
        task=TASK,
        llm=llm,
        browser=browser,
        max_actions_per_step=10,
    )

    print(f"Starte Website-Test für {WEBSITE}...")
    print("=" * 60)

    result = await agent.run(max_steps=50)

    print("\n" + "=" * 60)
    print("TEST ABGESCHLOSSEN")
    print("=" * 60)
    print(result.final_result())

    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
