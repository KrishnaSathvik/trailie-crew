export type TravelToolResult<T> = {
  data: T;
  retrievedAt: string;
  source: string;
};

export interface TravelTool<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput): Promise<TravelToolResult<TOutput>>;
}
