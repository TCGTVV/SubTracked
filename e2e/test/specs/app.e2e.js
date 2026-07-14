describe("SubTracked", () => {
  it("startet und zeigt den Fenstertitel", async () => {
    // 60s statt 15s: vier CI-Laeufe scheiterten alle nach exakt ~15s trotz
    // erfolgreicher WebDriver-Session (Software-Rendering ohne GPU im CI ist
    // deutlich langsamer als lokal) -- dieser Lauf trennt "nur langsam" von
    // "grundsaetzlich kaputt".
    await browser.waitUntil(async () => (await browser.getTitle()) === "SubTracked", {
      timeout: 60000,
      interval: 1000,
      timeoutMsg: "Fenstertitel wurde nicht innerhalb von 60s gesetzt",
    });
  });
});
