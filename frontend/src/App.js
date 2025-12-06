import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TaskList from './components/TaskList';
import './App.css';

// Use same-origin so Nginx proxies /api → backend
const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/tasks`);
      setTasks(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Failed to load tasks. Please check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;

    try {
      const response = await axios.post(`${API_URL}/api/tasks`, {
        title: newTask.trim()
      });
      setTasks([response.data, ...tasks]);
      setNewTask('');
    } catch (err) {
      console.error('Failed to add task:', err);
      alert('Failed to add task');
    }
  };

  const updateTask = async (id, updates) => {
    try {
      const response = await axios.put(`${API_URL}/api/tasks/${id}`, updates);
      setTasks(tasks.map(task =>
        task.id === id ? response.data : task
      ));
    } catch (err) {
      console.error('Failed to update task:', err);
      alert('Failed to update task');
    }
  };

  const deleteTask = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/tasks/${id}`);
      setTasks(tasks.filter(task => task.id !== id));
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task');
    }
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 Taskify</h1>
        <p>Simple Task Management App</p>
      </header>

      <div className="add-task-section">
        <div className="input-group">
          <input
            type="text"
            className="task-input"
            placeholder="Enter new task..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTask()}
          />
          <button className="add-btn" onClick={addTask}>
            ➕ Add Task
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
          <button onClick={fetchTasks} className="retry-btn">
            Retry
          </button>
        </div>
      )}

      <TaskList
        tasks={tasks}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
      />
    </div>
  );
}

export default App;
