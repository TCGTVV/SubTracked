import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteRate, listRates, setRate } from "../lib/db";
import { expectNoAxeViolations } from "../test-utils/axe";
import { RatesSection } from "./RatesSection";

vi.mock("../lib/db", () => ({
  listRates: vi.fn(),
  setRate: vi.fn(),
  deleteRate: vi.fn(),
}));

const mockList = vi.mocked(listRates);
const mockSet = vi.mocked(setRate);
const mockDelete = vi.mocked(deleteRate);

const usdEur = {
  fromCurrency: "USD",
  toCurrency: "EUR",
  rateMicros: 920_000,
  updatedAt: "2026-10-01 08:00:00",
};

describe("RatesSection", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockSet.mockReset();
    mockDelete.mockReset();
    mockList.mockResolvedValue([]);
  });

  it("listet hinterlegte Kurse lesbar auf", async () => {
    mockList.mockResolvedValue([usdEur]);
    render(<RatesSection />);
    expect(await screen.findByText("1 USD = 0,92 EUR")).toBeInTheDocument();
  });

  it("speichert einen Kurs als Mikro-Einheiten und meldet die Änderung", async () => {
    mockSet.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<RatesSection onChanged={onChanged} />);

    fireEvent.change(screen.getByLabelText(/^Kurs \(1/), { target: { value: "0,92" } });
    fireEvent.click(screen.getByRole("button", { name: "Kurs speichern" }));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("USD", "EUR", 920_000));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    // Eingabe wird nach dem Speichern geleert, Liste neu geladen.
    expect(screen.getByLabelText(/^Kurs \(1/)).toHaveValue("");
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it.each(["", "abc", "0", "-1", "1,1234567"])("lehnt die Eingabe %j ab", async (input) => {
    render(<RatesSection />);
    fireEvent.change(screen.getByLabelText(/^Kurs \(1/), { target: { value: input } });
    fireEvent.click(screen.getByRole("button", { name: "Kurs speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Kurs größer als 0/);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("löscht einen Kurs und meldet die Änderung", async () => {
    mockList.mockResolvedValue([usdEur]);
    mockDelete.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<RatesSection onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole("button", { name: "Kurs USD nach EUR löschen" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("USD", "EUR"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it("zeigt einen Backend-Fehler statt ihn zu verschlucken", async () => {
    mockSet.mockRejectedValue("Der Kurs muss größer als 0 sein.");
    render(<RatesSection />);
    fireEvent.change(screen.getByLabelText(/^Kurs \(1/), { target: { value: "1,1" } });
    fireEvent.click(screen.getByRole("button", { name: "Kurs speichern" }));
    expect(await screen.findByText(/größer als 0 sein/)).toBeInTheDocument();
  });

  it("hat keine axe-Verstöße", async () => {
    mockList.mockResolvedValue([usdEur]);
    render(<RatesSection />);
    await screen.findByText("1 USD = 0,92 EUR");
    await expectNoAxeViolations();
  });
});
