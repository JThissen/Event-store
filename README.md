## Description
An open-source event store based on Node.js and PostgreSQL. The event store ensures that all changes to an application are stored as a sequence of events. This ultimately allows for the reconstruction of the state at any point throughout its history.

## How to use
### Create

1. Make sure docker is up and running and start a postgres container (exposed at `localhost:5432`). Append adminer if you'd like to run that as well (exposed at `localhost:8080`).

```bash
service docker start
docker-compose up -d db adminer
```

2. Create the event store. Pass in the connection data and the name of the event store (optional). Furthermore, specify the name of the snapshot store as well as how often a snapshot should be taken (optional). Snapshotting is an optimization technique that reduces time spent on reading events from an event store. If you have hundreds or thousands of events this may come in handy.
```typescript
const eventStore = new EventStore()
await eventStore.create({
  host: 'localhost',
  port: '5432',
  dbName: 'postgres',
  user: 'postgres',
  password: 'postgres',
  ssl: false,
}, 'example_event_store', 'example_snapshot_store', 10)
```

3. Create a bunch of events. See `Event-store/src/tests/event-store.test.ts` from line 45 and onwards, e.g.:
```typescript
const updateCalculationEvent: Event = {
      id: uuid(),
      aggregate: { id: '82c01d88-d9a1-4380-ab03-a662069d8a01', name: 'calculation' },
      name: 'updateCalculationEvent',
      data: { pi: 3.1415, theta: 30, radius: 2 },
      metadata: {
        revision: 1,
        timestamp: (new Date()).getTime(),
        correlationId: 'af358d13-5975-42f5-b3f1-db80761320a2',
        causationId: 'af358d13-5975-42f5-b3f1-db80761320a2',
      }
    }
```

Where:
  - The `revision` must be incremented by 1 for every event. Every aggregate should keep track of its own individual revision number.
  - The `correlationId` is the id of the command that caused the event e.g. command -> event -> **command** -> event.
  - The `causationId` is the command that caused a chain e.g. **command** -> event -> command -> event. 

The rest should be self-explanatory.

4. Save as many events as you'd like. Snapshots are saved automatically after x revisions.
```typescript
await eventStore.saveEvents(createCalculationEvent, updateCalculationEvent, updateCalculationAgainEvent)
```

5. Manually save a snapshot.
```typescript
await this.saveSnapshot(aggregateId, revision, data);
```

### Read

1. Get events by their aggregate id.
```typescript
await eventStore.getEventsById(aggregateId)
```

2. Get a snapshot by its aggregate id.
```typescript
await eventStore.getSnapshotById(aggregateId)
```

3. Get the most recent event by its aggregate id.
```typescript
await eventStore.getLastEventById(aggregateId)
```

4. Get all events in a chronologic order. Optionally pass the start revision and the end revision.
```typescript
await eventStore.getAllEventsChronologically(startRevisionNumber, endRevisionNumber)
```

## Run tests locally
Make sure docker is up and running and start a postgres container (exposed at localhost:5432). Append adminer if you'd like to run that as well (exposed at localhost:8080).
```bash
service docker start
docker-compose up -d db adminer
```

Run the tests.
```bash
npm run test
```

## License
Do whatever you want to do.
