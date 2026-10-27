using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

// Push 11.5 / PART B: the collection now carries the shared PostgresFixture — it initializes
// exactly once before the first test of the collection (starts a throwaway postgres:16-alpine
// container via Testcontainers, applies all migrations, and publishes the connection string
// through CMS_PHASE34_TEST_POSTGRES) and is disposed after the last test of the collection.
[CollectionDefinition("PostgresIntegration", DisableParallelization = true)]
public sealed class PostgresIntegrationCollection : ICollectionFixture<PostgresFixture>
{
}
