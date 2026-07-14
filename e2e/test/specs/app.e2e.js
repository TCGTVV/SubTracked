describe("SubTracked", () => {
  it("startet und zeigt den Fenstertitel", async () => {
    // Sicherheitsnetz gegen Startup-Timing (Fenster/Webview-Ladezeit).
    await browser.waitUntil(async () => (await browser.getTitle()) === "SubTracked", {
      timeout: 15000,
      timeoutMsg: "Fenstertitel wurde nicht innerhalb von 15s gesetzt",
    });
  });
});
