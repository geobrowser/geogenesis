# PostgreSQL Connection Pooling: Limits, Scaling, and Configuration

**Date:** 2026-02-04  
**Type:** Topic Synthesis  
**Confidence:** High (multiple authoritative sources agree)

---

## Summary

PostgreSQL connections are a finite resource constrained by both hard limits and practical performance thresholds. The database's default `max_connections` is 100, but can theoretically go much higher. However, **practical performance degrades significantly beyond (core_count \* 2) + effective_spindle_count active connections**. Connection poolers like PgBouncer can accept thousands of client connections while maintaining a small pool of actual database connections, providing the primary scaling mechanism.

---

## Key Questions Answered

### 1. How do Postgres connections work?

PostgreSQL uses a **process-per-connection model**. When a client connects:

1. The central **Postmaster** process accepts the connection
2. It **forks a child "backend" process** to handle that specific connection
3. Each backend starts at ~5MB but can grow significantly based on data accessed
4. Backends communicate via **shared memory** structures that become contention points at scale

This architecture means:

- Each connection consumes memory (both for the process and shared structures)
- Operations like getting snapshots (`GetSnapshotData`) must iterate over ALL active processes
- Adding processes requires exclusive locks on shared structures like `ProcArrayLock`

**Source:** [PostgreSQL Docs - Connections](https://www.postgresql.org/docs/current/runtime-config-connection.html), [brandur.org](https://brandur.org/postgres-connections)

### 2. What's the maximum number of connections for a pool (PgBouncer)?

PgBouncer's limits are controlled by several parameters:

| Parameter              | Default       | Description                               |
| ---------------------- | ------------- | ----------------------------------------- |
| `max_client_conn`      | 100           | Maximum client connections to PgBouncer   |
| `default_pool_size`    | 20            | Server connections per user/database pair |
| `max_db_connections`   | 0 (unlimited) | Total server connections per database     |
| `max_user_connections` | 0 (unlimited) | Total server connections per user         |

**Theoretical maximum client connections:**

```
max_client_conn + (max_pool_size * total_databases * total_users)
```

**Practical limits:** PgBouncer is single-threaded, but can handle thousands of connections. For higher throughput, use `so_reuseport=1` to run multiple PgBouncer instances on the same port.

**Source:** [PgBouncer Config Documentation](https://www.pgbouncer.org/config.html)

### 3. What's the maximum for the database itself?

**PostgreSQL `max_connections`:**

- **Default:** 100
- **Theoretical maximum:** Limited by available memory and kernel resources
- **Cloud provider caps:** Typically 20-500 depending on instance size

**Hard constraints:**

- Memory for each backend process (~5MB minimum, can grow to hundreds of MB)
- Shared memory segment limits (SHMMAX, SHMALL)
- Semaphores: 1 per connection + other workers (controlled by SEMMNI, SEMMNS)
- File descriptors (often the first limit hit)
- Socket connection queue (`net.core.somaxconn`, default 128)

**AWS RDS formula example for PostgreSQL:**

```
LEAST({DBInstanceClassMemory/9531392}, 5000)
```

This caps at 5000 connections regardless of memory.

**Source:** [PostgreSQL Docs - Kernel Resources](https://www.postgresql.org/docs/current/kernel-resources.html), [AWS RDS Limits](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html)

### 4. How do you realistically scale connections?

**The scaling strategy hierarchy (most to least preferred):**

1. **Application-level connection pools** - Reuse connections within your app
2. **Minimum viable checkout** - Only hold connections during actual DB work
3. **PgBouncer transaction pooling** - Share connections between transactions
4. **Read replicas** - Distribute read traffic
5. **Horizontal sharding** - Split data across multiple databases

**Transaction pooling is the key:**

- Session pooling: Connection held for entire client session
- **Transaction pooling (recommended):** Connection assigned only during transactions
- Statement pooling: Connection assigned per statement (breaks transactions)

**Limitations of transaction pooling:**

- Cannot use session-level features: `SET`, `LISTEN/NOTIFY`, named prepared statements
- Modern PgBouncer (1.21+) handles prepared statements via `max_prepared_statements`

**Source:** [PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections), [brandur.org](https://brandur.org/postgres-connections)

### 5. What inputs impact concurrent connection capacity?

**Hardware factors:**
| Factor | Impact | Formula Contribution |
|--------|--------|---------------------|
| CPU cores | Direct - more cores = more parallel work | `core_count * 2` |
| Memory | Direct - each connection uses RAM | ~5-50MB per connection |
| Disk I/O (spindles/SSDs) | Moderate - reduces wait time | `+ effective_spindle_count` |
| Network bandwidth | Minor for typical workloads | N/A |

**Configuration factors:**
| Parameter | Impact | Recommendation |
|-----------|--------|----------------|
| `work_mem` | High - allocated per sort/hash per connection | Lower with more connections |
| `shared_buffers` | High - fixed overhead | 25% of RAM, max 40% |
| `effective_cache_size` | Low - query planning only | 75% of RAM |
| `max_connections` | Direct ceiling | Keep low, use pooler |

**Workload factors:**

- **Transaction duration:** Longer = fewer concurrent
- **Query complexity:** More work_mem allocations = fewer safe concurrent
- **Idle connections:** Still consume resources but less than active

**The Golden Rule Formula:**

```
Optimal active connections = (core_count * 2) + effective_spindle_count
```

Where:

- `core_count` = physical cores (NOT hyperthreads)
- `effective_spindle_count` = 0 if data cached, approaches actual spindle count as cache hit rate drops

**Source:** [PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)

---

## Confirmed Patterns (High Confidence)

1. **Performance degrades with more connections** - Multiple independent sources confirm throughput decreases past the optimal point due to:
   - Lock contention (spinlocks, LW locks, heavyweight locks)
   - Context switching overhead
   - Cache line contention
   - Shared memory structure scaling (some O(N^2) or O(N\*log(N)))

2. **Connection poolers are essential at scale** - Every source recommends external poolers over high `max_connections`

3. **Transaction pooling is the sweet spot** - Balances efficiency with usability

4. **The formula holds** - `(cores * 2) + spindles` consistently cited as starting point

---

## Emerging Consensus (Medium Confidence)

1. **PgBouncer over built-in pooling** - PostgreSQL deliberately excludes built-in pooling; external poolers provide:
   - Ability to run on separate machine (reduces DB server load)
   - Flexibility in pooling strategies
   - No duplication with client-side pools (Java/JDBC, etc.)

2. **Cloud providers cap connections for good reason** - The 500 connection ceiling on large instances is protective, not arbitrary

---

## Contradictions & Nuances

**Memory per connection varies wildly:**

- Sources cite 5MB starting, but workloads with large `work_mem` usage can see hundreds of MB per connection
- Resolution: The 5MB is baseline; actual depends on queries

**Hyperthreading in the formula:**

- PostgreSQL Wiki explicitly says "do not count HT threads"
- Some newer benchmarks suggest HT provides ~30% benefit
- Resolution: Start with physical cores, tune based on actual workload

---

## Actionable Recommendations

1. **Start with `max_connections` at 100-200**, even for large instances
2. **Deploy PgBouncer** in transaction mode with `default_pool_size` = 20-50
3. **Set `max_client_conn`** on PgBouncer to your actual expected concurrent client count
4. **Monitor these metrics:**
   - Active vs idle connections
   - Connection wait time
   - Lock contention in `pg_stat_activity`
5. **Tune `work_mem` inversely** to expected concurrent connections
6. **Reserve connections** for admin access: use `superuser_reserved_connections = 3`

---

## References

1. [PostgreSQL 18 Documentation - Connections and Authentication](https://www.postgresql.org/docs/current/runtime-config-connection.html) - Official docs on max_connections
2. [PostgreSQL 18 Documentation - Managing Kernel Resources](https://www.postgresql.org/docs/current/kernel-resources.html) - Shared memory, semaphores, resource limits
3. [PgBouncer Configuration Reference](https://www.pgbouncer.org/config.html) - All pooler settings
4. [PostgreSQL Wiki - Number of Database Connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections) - The formula and rationale
5. [How to Manage Connections Efficiently in Postgres - brandur.org](https://brandur.org/postgres-connections) - Excellent practical guide with code examples
6. [AWS RDS - Quotas and Constraints](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html) - Cloud provider limits and formulas
