export interface Event {
  id: string
  name: string
  aggregate: { id: string, name: string }
  data: { [key: string]: any }
  metadata: {
    revision: number
    timestamp: number
    correlationId: string
    causationId: string
  }
}
