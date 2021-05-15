export interface Snapshot {
  aggregateId: string
  revision: number,
  data: { [key: string]: any }
}
