import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationPermissionBanner } from "./NotificationPermissionBanner";

describe("NotificationPermissionBanner", () => {
  it("rendert nichts im loading-State", () => {
    const { container } = render(
      <NotificationPermissionBanner status="loading" onActivate={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("rendert nichts im granted-State", () => {
    const { container } = render(
      <NotificationPermissionBanner status="granted" onActivate={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt im denied-State den Blockiert-Hinweis ohne Button", () => {
    render(<NotificationPermissionBanner status="denied" onActivate={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/blockiert/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("zeigt im default-State den Aktivieren-Button und ruft onActivate beim Klick", () => {
    const onActivate = vi.fn();
    render(<NotificationPermissionBanner status="default" onActivate={onActivate} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /aktivieren/i }));
    expect(onActivate).toHaveBeenCalledOnce();
  });
});
