process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY ||= "sk-test-placeholder";
process.env.DATABASE_URL ||= "postgresql://dev:dev@localhost:5432/librarium_test";
process.env.REDIS_URL ||= "redis://localhost:6379";
