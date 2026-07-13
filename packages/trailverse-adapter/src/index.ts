export type TrailVerseParkSummary = Readonly<{
  id: string;
  name: string;
  stateCodes: readonly string[];
}>;

export interface TrailVerseReadAdapter {
  getPark(id: string): Promise<TrailVerseParkSummary | null>;
  searchParks(query: string): Promise<readonly TrailVerseParkSummary[]>;
}
