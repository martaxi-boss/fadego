/**
 * Lets a UI discard delayed availability responses after a newer request
 * or a date/service/professional change. Per component instance only.
 */
export class AvailabilityRequestVersion {
  private latest = 0

  begin(): number {
    return ++this.latest
  }

  invalidate(): void {
    this.latest += 1
  }

  isCurrent(version: number): boolean {
    return version === this.latest
  }
}
