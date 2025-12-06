import React, { useState } from 'react';

function TaskList({ tasks, onUpdateTask, onDeleteTask }) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const handleEditStart = (task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const handleEditSave = (id) => {
    if (!editTitle.trim()) return;
    onUpdateTask(id, { title: editTitle.trim() });
    setEditingId(null);
  };

  const toggleCompleted = (task) => {
    onUpdateTask(task.id, { isCompleted: !task.isCompleted });
  };

  return (
    <div className="task-list">
      {(!tasks || tasks.length === 0) ? (
        <div className="empty-state">
          <div>📝</div>
          <p>No tasks yet. Add one above!</p>
        </div>
      ) : (
        tasks.map((task) => (
          <div
            key={task.id}
            className={`task-item ${task.isCompleted ? 'finished' : ''}`}
          >
            {editingId === task.id ? (
              <div className="edit-mode">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleEditSave(task.id)}
                  className="edit-input"
                  autoFocus
                />
                <div className="edit-buttons">
                  <button
                    onClick={() => handleEditSave(task.id)}
                    className="save-btn"
                  >
                    💾 Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="cancel-btn"
                  >
                    ❌ Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="task-content"
                  onClick={() => toggleCompleted(task)}
                >
                  <div className={`task-checkbox ${task.isCompleted ? 'checked' : ''}`}>
                    {task.isCompleted ? '✅' : '⬜'}
                  </div>
                  <span className="task-title">{task.title}</span>
                </div>
                <div className="task-actions">
                  <button
                    onClick={() => handleEditStart(task)}
                    className="edit-btn"
                    title="Edit task"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="delete-btn"
                    title="Delete task"
                  >
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default TaskList;
