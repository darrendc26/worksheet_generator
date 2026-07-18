// App State
let currentTab = 'dashboard';
let stats = null;
let chapters = [];
let selectedChapter = null;
let generatorChapters = [];

// API Base URL
const API_BASE = '/api';

// On Document Load
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  loadDashboardStats();
  setupUploadZone();
  setupLibrarySearchFilters();
  setupGeneratorForm();
});

// 1. Navigation Controller
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Toggle active button
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle active view
  document.querySelectorAll('.tab-view').forEach((view) => {
    if (view.id === `view-${tabId}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // Update header text
  const titleEl = document.getElementById('current-view-title');
  const descEl = document.getElementById('current-view-desc');
  
  if (tabId === 'dashboard') {
    titleEl.textContent = 'Dashboard Overview';
    descEl.textContent = 'Tuition assessment performance & chapter statistics.';
    loadDashboardStats();
  } else if (tabId === 'upload') {
    titleEl.textContent = 'Bulk Chapter Upload';
    descEl.textContent = 'Upload textbook chapters to semantically chunk and summarize them.';
  } else if (tabId === 'library') {
    titleEl.textContent = 'Chapter Library';
    descEl.textContent = 'Browse through textbooks, summaries, formulas, and text chunks.';
    loadLibraryChapters();
  } else if (tabId === 'generator') {
    titleEl.textContent = 'Worksheet Assessment Playground';
    descEl.textContent = 'Instantly generate tuition assessments and print-ready PDFs.';
    loadGeneratorChaptersDropdown();
  } else if (tabId === 'telegram-bot') {
    titleEl.textContent = 'Telegram Bot Gateway';
    descEl.textContent = 'Automated worksheet delivery status & mobile integration.';
    loadTelegramBotStatus();
  }
}

// 2. Dashboard Loader
async function loadDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error('Failed to fetch statistics.');
    stats = await res.json();

    // Render Stats
    document.getElementById('stat-chapters').textContent = stats.chapters;
    document.getElementById('stat-worksheets').textContent = stats.worksheets;
    document.getElementById('stat-chunks').textContent = stats.chunks;
    document.getElementById('stat-subjects').textContent = stats.subjects;

    // Render Subjects tags list
    const subjectsContainer = document.getElementById('dashboard-subjects-list');
    subjectsContainer.innerHTML = '';
    if (stats.subjects_list && stats.subjects_list.length > 0) {
      stats.subjects_list.forEach((subj) => {
        const tag = document.createElement('div');
        tag.className = 'subject-tag';
        tag.innerHTML = `<span class="subject-tag-bullet"></span> ${escapeHtml(subj)}`;
        subjectsContainer.appendChild(tag);
      });
    } else {
      subjectsContainer.innerHTML = `<div class="file-info">No subjects uploaded yet.</div>`;
    }
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

// 3. Bulk Upload Handler
function setupUploadZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileNameEl = document.getElementById('selected-file-name');
  const uploadForm = document.getElementById('upload-form');
  const logsContainer = document.getElementById('upload-logs');
  const progressBar = document.getElementById('upload-progress');

  // Trigger file click
  dropZone.addEventListener('click', () => fileInput.click());

  // File drag states
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelection(fileInput.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFileSelection(fileInput.files[0]);
    }
  });

  function handleFileSelection(file) {
    fileNameEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    fileNameEl.style.color = '#38bdf8';

    // Proactively pre-fill forms by parsing filename
    const metadata = parseFilenameLocal(file.name);
    
    // Fill values if inputs are empty or default
    document.getElementById('input-subject').value = metadata.subject;
    document.getElementById('input-class').value = metadata.class;
    document.getElementById('input-board').value = metadata.board;
    document.getElementById('input-chapter').value = metadata.chapter_name;

    printLog('system', `File selected: "${file.name}"`);
    printLog('system', `Filename parsing auto-detected Class: ${metadata.class}, Subject: ${metadata.subject}, Board: ${metadata.board}, Chapter: ${metadata.chapter_name}`);
  }

  const submitBtn = document.getElementById('btn-upload-submit');
  const cancelBtn = document.getElementById('btn-upload-cancel');
  let uploadAbortController = null;

  cancelBtn.addEventListener('click', () => {
    if (uploadAbortController) {
      printLog('error', 'Cancelling task. Awaiting termination...');
      uploadAbortController.abort();
    }
  });

  // Upload Form Submit
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) {
      alert('Please select a PDF file first.');
      return;
    }

    const subject = document.getElementById('input-subject').value.trim();
    const classVal = document.getElementById('input-class').value.trim();
    const board = document.getElementById('input-board').value.trim();
    const chapterName = document.getElementById('input-chapter').value.trim();

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('subject', subject);
    formData.append('class', classVal);
    formData.append('board', board);
    formData.append('chapter_name', chapterName);

    // Instantiate AbortController
    uploadAbortController = new AbortController();

    // Disable submit and show cancel
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    cancelBtn.style.display = 'inline-flex';

    // Reset progress
    progressBar.style.width = '0%';
    logsContainer.innerHTML = '';
    printLog('process', 'Initializing upload task...');
    progressBar.style.width = '15%';

    try {
      printLog('process', 'Sending PDF chapter bytes to server...');
      progressBar.style.width = '35%';

      const res = await fetch(`${API_BASE}/chapters/upload`, {
        method: 'POST',
        body: formData,
        signal: uploadAbortController.signal
      });

      progressBar.style.width = '70%';
      printLog('process', 'Server processing started. PDF parsing and Gemini AI chunking active...');

      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (jsonErr) {
        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}: The server took too long to respond (Timeout). Check the Chapter Library in a few minutes, as the process may still complete in the background.`);
        }
        throw new Error('Invalid JSON response from server.');
      }
      if (!res.ok) throw new Error(result.error || 'Server processing failed.');

      progressBar.style.width = '100%';
      printLog('success', `SUCCESS: ${result.message}`);
      printLog('success', `Created Chapter ID: ${result.chapter.id}`);
      printLog('success', `Ingested Chunks: ${result.chunks_count}`);

      // Clear file inputs
      fileInput.value = '';
      fileNameEl.textContent = 'No file selected (Max 10MB)';
      fileNameEl.style.color = 'var(--text-muted)';
      uploadForm.reset();
    } catch (err) {
      progressBar.style.width = '0%';
      if (err.name === 'AbortError') {
        printLog('error', 'PROCESS TERMINATED: Upload and analysis cancelled by user.');
      } else {
        printLog('error', `ERROR: ${err.message}`);
      }
    } finally {
      // Re-enable submit and hide cancel
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      cancelBtn.style.display = 'none';
      uploadAbortController = null;
    }
  });

  function printLog(type, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
}

// 4. Chapter Library Handler
async function loadLibraryChapters() {
  const listContainer = document.getElementById('chapters-list-container');
  listContainer.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const res = await fetch(`${API_BASE}/chapters`);
    if (!res.ok) throw new Error('Failed to fetch chapters.');
    chapters = await res.json();
    renderLibraryChapters(chapters);
    updateFilterOptions();
  } catch (err) {
    listContainer.innerHTML = `<div class="file-info" style="color: #f87171;">Failed to load library: ${err.message}</div>`;
  }
}

function renderLibraryChapters(list) {
  const container = document.getElementById('chapters-list-container');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<div class="file-info">No chapters match your query.</div>`;
    return;
  }

  list.forEach((ch) => {
    const card = document.createElement('div');
    card.className = `chapter-item-card ${selectedChapter && selectedChapter.id === ch.id ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="chapter-item-meta">
        <h4>${escapeHtml(ch.chapter_name)}</h4>
        <div class="chapter-item-tags">
          <span class="tag-board">${escapeHtml(ch.board)}</span>
          <span>${escapeHtml(ch.subject)}</span>
          <span>${escapeHtml(ch.class || 'N/A')}</span>
        </div>
      </div>
      <div class="arrow-indicator">➔</div>
    `;
    card.addEventListener('click', () => loadChapterDetails(ch.id, card));
    container.appendChild(card);
  });
}

async function loadChapterDetails(id, cardElement) {
  // Highlight card
  document.querySelectorAll('.chapter-item-card').forEach(x => x.classList.remove('selected'));
  if (cardElement) cardElement.classList.add('selected');

  const detailPanel = document.getElementById('chapter-detail-panel');
  detailPanel.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch(`${API_BASE}/chapters/${id}`);
    if (!res.ok) throw new Error('Failed to load chapter detail.');
    selectedChapter = await res.json();

    renderChapterDetails(selectedChapter);
  } catch (err) {
    detailPanel.innerHTML = `<div class="file-info" style="color: #f87171;">Error: ${err.message}</div>`;
  }
}

function renderChapterDetails(ch) {
  const detailPanel = document.getElementById('chapter-detail-panel');
  
  let summaryHtml = '';
  const s = ch.summary;
  
  if (s) {
    if (s.topics) {
      summaryHtml += `
        <div class="summary-block">
          <h4>📌 Topics Covered</h4>
          <ul>${s.topics.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.important_terms) {
      summaryHtml += `
        <div class="summary-block">
          <h4>🔑 Important Key Terms</h4>
          <ul>${s.important_terms.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.formulas) {
      summaryHtml += `
        <div class="summary-block">
          <h4>📐 Formulas & Equations</h4>
          <ul>${s.formulas.map(f => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.dates) {
      summaryHtml += `
        <div class="summary-block">
          <h4>📅 Important Dates</h4>
          <ul>${s.dates.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.events) {
      summaryHtml += `
        <div class="summary-block">
          <h4>⚔️ Key Historical Events</h4>
          <ul>${s.events.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.people) {
      summaryHtml += `
        <div class="summary-block">
          <h4>👤 Historical Figures</h4>
          <ul>${s.people.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.key_points) {
      summaryHtml += `
        <div class="summary-block">
          <h4>💡 Key Core Theories</h4>
          <ul>${s.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.key_concepts) {
      summaryHtml += `
        <div class="summary-block">
          <h4>💡 Key Concepts</h4>
          <ul>${s.key_concepts.map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.code_or_commands) {
      summaryHtml += `
        <div class="summary-block">
          <h4>💻 Code & Commands</h4>
          <ul>${s.code_or_commands.map(c => `<li><code>${escapeHtml(c)}</code></li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.writing_formats_or_examples) {
      summaryHtml += `
        <div class="summary-block">
          <h4>📝 Writing Formats & Examples</h4>
          <ul>${s.writing_formats_or_examples.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
        </div>
      `;
    }
    if (s.question_patterns) {
      summaryHtml += `
        <div class="summary-block">
          <h4>❓ Common Question Patterns</h4>
          <ul>${s.question_patterns.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        </div>
      `;
    }
  } else {
    summaryHtml = `<div class="file-info">No structured summary generated for this chapter.</div>`;
  }

  const chunksHtml = ch.chunks.map(chunk => `
    <div class="chunk-card">
      <div class="chunk-header-info">
        <span class="chunk-title">Chunk ${chunk.chunk_order}: ${escapeHtml(chunk.chunk_title || 'Untitled Section')}</span>
        <span class="chunk-type-badge badge-${chunk.chunk_type.toLowerCase()}">${escapeHtml(chunk.chunk_type)}</span>
      </div>
      <div class="chunk-content-body">${escapeHtml(chunk.chunk_content)}</div>
    </div>
  `).join('');

  detailPanel.innerHTML = `
    <div class="chapter-details-header">
      <div id="chapter-header-view-mode" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
        <div>
          <h2>${escapeHtml(ch.chapter_name)}</h2>
          <p>Subject: ${escapeHtml(ch.subject)} | Board: ${escapeHtml(ch.board)} | Class: ${escapeHtml(ch.class || 'N/A')}</p>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button class="btn btn-secondary" id="edit-chapter-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px;">✏️ Edit Tags</button>
          <button class="btn btn-danger" id="delete-chapter-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px;">🗑️ Delete</button>
        </div>
      </div>

      <div id="chapter-header-edit-mode" style="display: none; flex-direction: column; gap: 10px;">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-blue);">Edit Metadata Tags</h4>
        <div class="edit-fields-row" style="display: flex; flex-wrap: wrap; gap: 10px;">
          <div class="form-group-inline" style="flex: 2; min-width: 200px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.75rem; color: var(--text-muted);">Chapter Name</label>
            <input type="text" id="edit-chapter-name" value="${escapeHtml(ch.chapter_name)}" style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; color: white; font-size: 0.9rem;">
          </div>
          <div class="form-group-inline" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.75rem; color: var(--text-muted);">Subject</label>
            <input type="text" id="edit-subject" value="${escapeHtml(ch.subject)}" style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; color: white; font-size: 0.9rem;">
          </div>
          <div class="form-group-inline" style="flex: 1; min-width: 100px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.75rem; color: var(--text-muted);">Class</label>
            <input type="text" id="edit-class" value="${escapeHtml(ch.class || '')}" style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; color: white; font-size: 0.9rem;">
          </div>
          <div class="form-group-inline" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.75rem; color: var(--text-muted);">Board</label>
            <input type="text" id="edit-board" value="${escapeHtml(ch.board)}" style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; color: white; font-size: 0.9rem;">
          </div>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 5px;">
          <button class="btn btn-primary" id="save-chapter-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; background: var(--accent-violet); border: none; color: white;">💾 Save</button>
          <button class="btn btn-secondary" id="cancel-edit-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px;">Cancel</button>
        </div>
      </div>
    </div>
    
    <div class="summary-tab-container">
      <button class="tab-btn active" id="library-btn-notes">Notes & Summary</button>
      <button class="tab-btn" id="library-btn-chunks">Textbook Chunks (${ch.chunks.length})</button>
    </div>

    <div id="library-detail-content">
      <div class="summary-details-section">${summaryHtml}</div>
    </div>
  `;

  // Bind sub-tabs toggle
  const notesBtn = document.getElementById('library-btn-notes');
  const chunksBtn = document.getElementById('library-btn-chunks');
  const contentEl = document.getElementById('library-detail-content');
  
  const editBtn = document.getElementById('edit-chapter-btn');
  const deleteBtn = document.getElementById('delete-chapter-btn');
  const viewModeEl = document.getElementById('chapter-header-view-mode');
  const editModeEl = document.getElementById('chapter-header-edit-mode');
  const saveBtn = document.getElementById('save-chapter-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');

  notesBtn.addEventListener('click', () => {
    notesBtn.classList.add('active');
    chunksBtn.classList.remove('active');
    contentEl.innerHTML = `<div class="summary-details-section">${summaryHtml}</div>`;
  });

  chunksBtn.addEventListener('click', () => {
    chunksBtn.classList.add('active');
    notesBtn.classList.remove('active');
    contentEl.innerHTML = `<div class="chunks-scroller">${chunksHtml}</div>`;
  });

  editBtn.addEventListener('click', () => {
    viewModeEl.style.display = 'none';
    editModeEl.style.display = 'flex';
  });

  cancelEditBtn.addEventListener('click', () => {
    editModeEl.style.display = 'none';
    viewModeEl.style.display = 'flex';
    document.getElementById('edit-chapter-name').value = ch.chapter_name;
    document.getElementById('edit-subject').value = ch.subject;
    document.getElementById('edit-class').value = ch.class || '';
    document.getElementById('edit-board').value = ch.board;
  });

  saveBtn.addEventListener('click', async () => {
    const updatedName = document.getElementById('edit-chapter-name').value.trim();
    const updatedSubject = document.getElementById('edit-subject').value.trim();
    const updatedClass = document.getElementById('edit-class').value.trim();
    const updatedBoard = document.getElementById('edit-board').value.trim();

    if (!updatedName || !updatedSubject || !updatedClass || !updatedBoard) {
      alert('All fields (Chapter Name, Subject, Class, and Board) are required.');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const res = await fetch(`${API_BASE}/chapters/${ch.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chapter_name: updatedName,
          subject: updatedSubject,
          class: updatedClass,
          board: updatedBoard
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update metadata.');
      }

      const resData = await res.json();
      alert('Metadata updated successfully!');
      
      // Update selectedChapter state in client
      selectedChapter = resData.chapter;
      
      // Reload lists and stats to update filters/tags
      await loadLibraryChapters();
      loadDashboardStats();
      
      // Re-render the details panel with new values
      loadChapterDetails(ch.id);
    } catch (err) {
      alert(`Error updating chapter tags: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save';
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const confirmed = confirm(`⚠️ Are you sure you want to delete "${ch.chapter_name}"?\n\nThis action cannot be undone. All text chunks and associated worksheets will be deleted.`);
    if (!confirmed) return;

    try {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
      
      const res = await fetch(`${API_BASE}/chapters/${ch.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete chapter.');
      }

      alert('Chapter deleted successfully.');
      selectedChapter = null;
      
      // Reset details panel placeholder
      detailPanel.innerHTML = `
        <div class="chapter-details-placeholder">
          <div class="placeholder-icon">📚</div>
          <h4>Select a chapter from the list to view summaries & chunks.</h4>
        </div>
      `;

      // Reload lists and stats
      loadLibraryChapters();
      loadDashboardStats();
    } catch (err) {
      alert(`Error deleting chapter: ${err.message}`);
      deleteBtn.disabled = false;
      deleteBtn.textContent = '🗑️ Delete';
    }
  });
}

function setupLibrarySearchFilters() {
  const searchInput = document.getElementById('library-search');
  const filterClass = document.getElementById('filter-class');
  const filterSubject = document.getElementById('filter-subject');
  const filterBoard = document.getElementById('filter-board');

  const filterHandler = () => {
    const q = searchInput.value.toLowerCase();
    const selectedClass = filterClass.value.toLowerCase();
    const selectedSubj = filterSubject.value.toLowerCase();
    const selectedBoard = filterBoard.value.toLowerCase();

    const filtered = chapters.filter((ch) => {
      const nameMatch = ch.chapter_name.toLowerCase().includes(q) || ch.subject.toLowerCase().includes(q);
      const classMatch = !selectedClass || (ch.class || 'General').toLowerCase() === selectedClass;
      const subjMatch = !selectedSubj || ch.subject.toLowerCase() === selectedSubj;
      const boardMatch = !selectedBoard || ch.board.toLowerCase() === selectedBoard;
      return nameMatch && classMatch && subjMatch && boardMatch;
    });

    renderLibraryChapters(filtered);
  };

  searchInput.addEventListener('input', filterHandler);
  filterClass.addEventListener('change', filterHandler);
  filterSubject.addEventListener('change', filterHandler);
  filterBoard.addEventListener('change', filterHandler);
}

function updateFilterOptions() {
  const filterClass = document.getElementById('filter-class');
  const filterSubject = document.getElementById('filter-subject');
  const filterBoard = document.getElementById('filter-board');

  const classes = Array.from(new Set(chapters.map(x => x.class || 'General')));
  const subjects = Array.from(new Set(chapters.map(x => x.subject)));
  const boards = Array.from(new Set(chapters.map(x => x.board)));

  filterClass.innerHTML = '<option value="">All Classes</option>';
  classes.sort().forEach(c => {
    filterClass.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  });

  filterSubject.innerHTML = '<option value="">All Subjects</option>';
  subjects.sort().forEach(s => {
    filterSubject.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
  });

  filterBoard.innerHTML = '<option value="">All Boards</option>';
  boards.sort().forEach(b => {
    filterBoard.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
  });
}

// 5. Worksheet Generator Playground
async function loadGeneratorChaptersDropdown() {
  const container = document.getElementById('select-gen-chapters-container');
  container.innerHTML = '<div class="loading-spinner-small"></div>';

  try {
    const res = await fetch(`${API_BASE}/chapters`);
    if (!res.ok) throw new Error('Failed to fetch chapters.');
    generatorChapters = await res.json();

    updatePlaygroundFilterOptions();
    setupPlaygroundFilters();
    renderGeneratorChapters(generatorChapters);
  } catch (err) {
    container.innerHTML = `<div class="file-info" style="color: #f87171;">Error: ${err.message}</div>`;
  }
}

function updatePlaygroundFilterOptions() {
  const filterClass = document.getElementById('play-filter-class');
  const filterSubject = document.getElementById('play-filter-subject');
  const filterBoard = document.getElementById('play-filter-board');

  const classes = Array.from(new Set(generatorChapters.map(ch => ch.class || 'General')));
  const subjects = Array.from(new Set(generatorChapters.map(ch => ch.subject)));
  const boards = Array.from(new Set(generatorChapters.map(ch => ch.board)));

  filterClass.innerHTML = '<option value="">All Classes</option>';
  classes.sort().forEach(c => {
    filterClass.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  });

  filterSubject.innerHTML = '<option value="">All Subjects</option>';
  subjects.sort().forEach(s => {
    filterSubject.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
  });

  filterBoard.innerHTML = '<option value="">All Boards</option>';
  boards.sort().forEach(b => {
    filterBoard.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
  });
}

let playgroundFiltersInitialized = false;
function setupPlaygroundFilters() {
  if (playgroundFiltersInitialized) return;
  
  const searchInput = document.getElementById('play-chapter-search');
  const filterClass = document.getElementById('play-filter-class');
  const filterSubject = document.getElementById('play-filter-subject');
  const filterBoard = document.getElementById('play-filter-board');

  const filterHandler = () => {
    const q = searchInput.value.toLowerCase();
    const selectedClass = filterClass.value.toLowerCase();
    const selectedSubj = filterSubject.value.toLowerCase();
    const selectedBoard = filterBoard.value.toLowerCase();

    const filtered = generatorChapters.filter((ch) => {
      const nameMatch = ch.chapter_name.toLowerCase().includes(q) || ch.subject.toLowerCase().includes(q);
      const classMatch = !selectedClass || (ch.class || 'General').toLowerCase() === selectedClass;
      const subjMatch = !selectedSubj || ch.subject.toLowerCase() === selectedSubj;
      const boardMatch = !selectedBoard || ch.board.toLowerCase() === selectedBoard;
      return nameMatch && classMatch && subjMatch && boardMatch;
    });

    renderGeneratorChapters(filtered);
  };

  searchInput.addEventListener('input', filterHandler);
  filterClass.addEventListener('change', filterHandler);
  filterSubject.addEventListener('change', filterHandler);
  filterBoard.addEventListener('change', filterHandler);
  
  playgroundFiltersInitialized = true;
}

function renderGeneratorChapters(list) {
  const container = document.getElementById('select-gen-chapters-container');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="file-info">No chapters match selection.</div>';
    return;
  }

  list.forEach((ch) => {
    const item = document.createElement('label');
    item.className = 'chapter-checkbox-item';
    item.innerHTML = `
      <input type="checkbox" name="chapter_id" value="${ch.id}">
      <div class="chapter-cb-details">
        <span class="chapter-cb-name">${escapeHtml(ch.chapter_name)}</span>
        <div class="chapter-cb-badges">
          <span class="cb-badge cb-badge-class">${escapeHtml(ch.class || 'General')}</span>
          <span class="cb-badge cb-badge-subject">${escapeHtml(ch.subject)}</span>
          <span class="cb-badge cb-badge-board">${escapeHtml(ch.board)}</span>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

function setupGeneratorForm() {
  const form = document.getElementById('generator-form');
  const statusBox = document.getElementById('gen-status-box');
  const statusLabel = statusBox.querySelector('.status-label');
  const spinner = document.getElementById('gen-spinner');
  const previewPanel = document.getElementById('worksheet-preview-panel');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const checkedBoxes = form.querySelectorAll('input[name="chapter_id"]:checked');
    const chapterIds = Array.from(checkedBoxes).map(cb => cb.value);
    
    const difficulty = document.getElementById('select-gen-diff').value;
    const count = Number(document.getElementById('select-gen-count').value);
    const mode = document.getElementById('select-gen-mode').value;
    const keyFormat = document.getElementById('select-gen-key-format').value;
    const includeDiagrams = document.getElementById('select-gen-include-diagrams').value === 'true';
    const additionalNotes = document.getElementById('select-gen-notes').value.trim();

    if (chapterIds.length === 0) {
      alert('Please select at least one chapter.');
      return;
    }

    if (isNaN(count) || count < 1 || count > 50) {
      alert('Please enter a valid question count between 1 and 50.');
      return;
    }

    // Set Loading State
    statusLabel.textContent = 'Generating combined assessment via Gemini... This will take a few seconds.';
    statusLabel.style.color = '#38bdf8';
    spinner.style.display = 'block';
    previewPanel.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const res = await fetch(`${API_BASE}/worksheets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_ids: chapterIds,
          difficulty,
          question_count: count,
          generation_mode: mode,
          key_format: keyFormat,
          include_diagrams: includeDiagrams,
          additional_notes: additionalNotes,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Worksheet generation failed.');

      // Success
      statusLabel.textContent = result.is_cached 
        ? '✅ Worksheet loaded from database cache.' 
        : '✅ Worksheet successfully generated from scratch!';
      statusLabel.style.color = '#34d399';
      spinner.style.display = 'none';

      // Render Preview
      let buttonsHtml = `
        <a href="${result.pdf_url}" target="_blank" class="btn btn-download">
          <span>📥</span> Download Worksheet PDF
        </a>
      `;

      if (result.key_pdf_url) {
        buttonsHtml += `
          <a href="${result.key_pdf_url}" target="_blank" class="btn btn-download" style="background: linear-gradient(135deg, var(--accent-violet) 0%, #7c3aed 100%); margin-left: 10px;">
            <span>🔑</span> Download Answer Key PDF
          </a>
        `;
      }

      previewPanel.innerHTML = `
        <div class="generated-worksheet-container">
          <div class="worksheet-actions-header">
            <h3>Worksheet Generated</h3>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
              ${buttonsHtml}
            </div>
          </div>
          <div class="summary-block" style="border-color: rgba(16, 185, 129, 0.25);">
            <p style="font-size: 0.9rem; color: #a5b4fc; line-height: 1.4;">
              <strong>Worksheet PDF:</strong> <a href="${result.pdf_url}" target="_blank" style="color: var(--accent-blue); text-decoration: underline;">${result.pdf_url}</a>
            </p>
            ${result.key_pdf_url ? `
            <p style="font-size: 0.9rem; color: #a5b4fc; line-height: 1.4; margin-top: 5px;">
              <strong>Answer Key PDF:</strong> <a href="${result.key_pdf_url}" target="_blank" style="color: var(--accent-violet); text-decoration: underline;">${result.key_pdf_url}</a>
            </p>
            ` : ''}
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
              You can open the PDF links in a new tab to print them.
            </p>
          </div>
        </div>
      `;
    } catch (err) {
      statusLabel.textContent = `❌ Generation Error: ${err.message}`;
      statusLabel.style.color = '#f87171';
      spinner.style.display = 'none';
      previewPanel.innerHTML = `<div class="file-info" style="color: #f87171;">Failed to generate: ${err.message}</div>`;
    }
  });
}

// 6. Filename Parser utility locally (UX optimization helper)
function parseFilenameLocal(filename) {
  const baseName = filename.split('/').pop() || filename;
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, "");
  
  let workingName = nameWithoutExt.replace(/[_-]/g, ' ').trim();

  let parsedClass = 'General';
  let parsedSubject = 'General';
  let parsedBoard = 'NCERT';

  // 1. Detect Class / Grade
  const classRegex = /\b(?:class|grade|gr|cl)\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\b/i;
  const classMatch = workingName.match(classRegex);
  if (classMatch) {
    const num = classMatch[1] || classMatch[2];
    parsedClass = `Class ${num}`;
    workingName = workingName.replace(classMatch[0], '');
  } else {
    const standaloneNumberMatch = workingName.match(/\b(9|10|11|12|8|7|6)\b/);
    if (standaloneNumberMatch) {
      parsedClass = `Class ${standaloneNumberMatch[1]}`;
      workingName = workingName.replace(standaloneNumberMatch[0], '');
    }
  }

  // 2. Detect Board
  const boardRegex = /\b(cbse|icse|ncert|gb|goa\s*board|state\s*board|ib|igcse)\b/i;
  const boardMatch = workingName.match(boardRegex);
  if (boardMatch) {
    const rawBoard = boardMatch[1].toLowerCase();
    if (rawBoard === 'gb' || rawBoard.startsWith('goa')) {
      parsedBoard = 'Goa Board';
    } else if (rawBoard === 'cbse') {
      parsedBoard = 'CBSE';
    } else if (rawBoard === 'ncert') {
      parsedBoard = 'NCERT';
    } else if (rawBoard === 'icse') {
      parsedBoard = 'ICSE';
    } else {
      parsedBoard = boardMatch[1].toUpperCase();
    }
    workingName = workingName.replace(boardMatch[0], '');
  }

  // 3. Detect Subject
  const subjectRegex = /\b(math|maths|mathematics|sci|science|physics|phy|chemistry|chem|biology|bio|history|hist|geography|geo|civics|english|eng|it|information\s*technology|computer\s*science|comp\s*sci|computer|communications|communication\s*skills|communication|comm)\b/i;
  const subjectMatch = workingName.match(subjectRegex);
  if (subjectMatch) {
    const rawSubj = subjectMatch[1].toLowerCase();
    if (rawSubj === 'math' || rawSubj === 'maths' || rawSubj === 'mathematics') {
      parsedSubject = 'Mathematics';
    } else if (rawSubj === 'sci' || rawSubj === 'science') {
      parsedSubject = 'Science';
    } else if (rawSubj === 'physics' || rawSubj === 'phy') {
      parsedSubject = 'Physics';
    } else if (rawSubj === 'chemistry' || rawSubj === 'chem') {
      parsedSubject = 'Chemistry';
    } else if (rawSubj === 'biology' || rawSubj === 'bio') {
      parsedSubject = 'Biology';
    } else if (rawSubj === 'history' || rawSubj === 'hist') {
      parsedSubject = 'History';
    } else if (rawSubj === 'geography' || rawSubj === 'geo') {
      parsedSubject = 'Geography';
    } else if (rawSubj === 'civics') {
      parsedSubject = 'Civics';
    } else if (rawSubj === 'english' || rawSubj === 'eng') {
      parsedSubject = 'English';
    } else if (
      rawSubj === 'it' || rawSubj === 'information technology' ||
      rawSubj === 'computer science' || rawSubj === 'comp sci' ||
      rawSubj === 'computer'
    ) {
      parsedSubject = 'Information Technology';
    } else if (
      rawSubj === 'communications' || rawSubj === 'communication' ||
      rawSubj === 'communication skills' || rawSubj === 'comm'
    ) {
      parsedSubject = 'Communications';
    }
    workingName = workingName.replace(subjectMatch[0], '');
  }

  // 4. Chapter Name is the remaining workingName
  let parsedChapter = workingName
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (!parsedChapter) {
    parsedChapter = `${parsedSubject} Chapter`;
  }

  return {
    class: parsedClass,
    subject: parsedSubject,
    board: parsedBoard,
    chapter_name: parsedChapter,
  };
}

// Utility: Escape HTML text to prevent injections
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadTelegramBotStatus() {
  const badge = document.getElementById('bot-status-badge');
  const nameVal = document.getElementById('bot-name-val');
  const usernameVal = document.getElementById('bot-username-val');
  const linkBtn = document.getElementById('btn-bot-link');

  try {
    const res = await fetch(`${API_BASE}/bot/status`);
    if (!res.ok) throw new Error('Failed to fetch bot status.');
    const status = await res.json();

    if (status.isOnline) {
      badge.className = 'bot-status-badge online';
      badge.querySelector('.status-text').textContent = 'ONLINE';
      nameVal.textContent = status.name;
      usernameVal.textContent = `@${status.username}`;
      
      linkBtn.classList.remove('disabled');
      linkBtn.href = `https://t.me/${status.username}`;
    } else {
      badge.className = 'bot-status-badge offline';
      badge.querySelector('.status-text').textContent = 'OFFLINE';
      nameVal.textContent = '-';
      usernameVal.textContent = '-';
      
      linkBtn.classList.add('disabled');
      linkBtn.href = '#';
    }
  } catch (err) {
    console.error('Error loading bot status:', err);
    badge.className = 'bot-status-badge offline';
    badge.querySelector('.status-text').textContent = 'ERROR';
    nameVal.textContent = '-';
    usernameVal.textContent = '-';
    linkBtn.classList.add('disabled');
    linkBtn.href = '#';
  }
}
