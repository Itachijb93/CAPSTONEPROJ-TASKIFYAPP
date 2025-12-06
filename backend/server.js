require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MSSQL connection pool
let dbPool = null;

// Base config (initially points at master to allow DB creation)
function getBaseConfig() {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || 'master',
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

// Ensure taskify_db and dbo.tasks exist
async function ensureSchema() {
  const baseConfig = getBaseConfig();
  console.log('🔍 Ensuring schema with:', {
    server: baseConfig.server,
    port: baseConfig.port,
    user: baseConfig.user,
    database: baseConfig.database
  });

  const tempPool = await sql.connect(baseConfig);

  // 1) Create database if missing
  await tempPool.request().query(`
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'taskify_db')
    BEGIN
      PRINT 'Creating database taskify_db';
      CREATE DATABASE taskify_db;
    END
  `);

  // 2) Create tasks table inside taskify_db if missing
  await tempPool.request().query(`
    USE taskify_db;
    IF OBJECT_ID('dbo.tasks', 'U') IS NULL
    BEGIN
      PRINT 'Creating table dbo.tasks';
      CREATE TABLE dbo.tasks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        description NVARCHAR(1000) NULL,
        isCompleted BIT NOT NULL DEFAULT 0,
        createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NULL
      );
    END
  `);

  await tempPool.close();
  console.log('✅ Schema ensured: taskify_db + dbo.tasks ready');
}

async function getDbPool() {
  if (!dbPool) {
    // Make sure DB and table exist
    await ensureSchema();

    // Now connect directly to taskify_db for normal traffic
    const config = {
      ...getBaseConfig(),
      database: 'taskify_db'
    };

    console.log('🔍 Connecting with:', {
      server: config.server,
      port: config.port,
      user: config.user,
      database: config.database
    });

    dbPool = await sql.connect(config);
    console.log('✅ MSSQL Database connected (SQL login)!');
  }
  return dbPool;
}

async function query(sqlQuery, params = {}) {
  const pool = await getDbPool();
  try {
    const request = pool.request();

    // Add parameters safely
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const result = await request.query(sqlQuery);
    return result;
  } catch (err) {
    console.error('SQL error:', err.message);
    throw err;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1 as connected');
    res.json({
      status: 'OK',
      message: 'Database connected successfully!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({
      error: 'Database connection failed',
      details: error.message
    });
  }
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await query('SELECT * FROM dbo.tasks ORDER BY id DESC');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching tasks:', error.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Add new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || title.trim().length < 3) {
      return res.status(400).json({
        error: 'Task title must be at least 3 characters'
      });
    }

    const insertSQL = `
      INSERT INTO dbo.tasks (title, isCompleted)
      OUTPUT INSERTED.*
      VALUES (@title, 0);
    `;
    const result = await query(insertSQL, { title: title.trim() });
    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Error creating task:', error.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isCompleted } = req.body;
    const taskId = parseInt(id, 10);

    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }

    const updateSQL = `
      UPDATE dbo.tasks
      SET 
        title = COALESCE(@title, title),
        isCompleted = COALESCE(@isCompleted, isCompleted),
        updated_at = SYSDATETIME()
      WHERE id = @id;
    `;

    await query(updateSQL, {
      id: taskId,
      title: title ?? null,
      isCompleted: isCompleted ?? null
    });

    const selectSQL = `
      SELECT *
      FROM dbo.tasks
      WHERE id = @id;
    `;
    const result = await query(selectSQL, { id: taskId });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error updating task:', error.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteSQL = 'DELETE FROM dbo.tasks WHERE id = @id';
    const result = await query(deleteSQL, { id: parseInt(id, 10) });

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error.message);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (dbPool) {
    try {
      await dbPool.close();
      console.log('✅ Database pool closed');
    } catch (error) {
      console.error('Error closing pool:', error.message);
    }
  }
  process.exit(0);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Taskify Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📋 Tasks API: http://localhost:${PORT}/api/tasks`);
  console.log(`🛠️  Press Ctrl+C to shutdown gracefully`);
});
