// ======================
// CONFIGURATION
// ======================
const SECTIONS = {
    AMSTHEC: {
        name: "AMSTHEC",
        title: "Mathematics, Surveying & Transportation Engineering",
        total: 75,
        time: 5 * 60 * 60, // 5 hours in seconds
        topics: [
            "Algebra", "Trigonometry", "Geometry", "Calculus",
            "Differential Equations", "Probability", "Surveying",
            "Transportation Engineering", "Highway Design"
        ]
    },
    HPGE: {
        name: "HPGE",
        title: "Hydraulics & Geotechnical Engineering",
        total: 50,
        time: 4 * 60 * 60, // 4 hours in seconds
        topics: [
            "Fluid Mechanics", "Hydraulics", "Hydrology", "Geology",
            "Soil Mechanics", "Foundation Engineering", "Earthworks",
            "Retaining Structures", "Slope Stability"
        ]
    },
    PSAD: {
        name: "PSAD",
        title: "Structural Design & Construction",
        total: 75,
        time: 5 * 60 * 60, // 5 hours in seconds
        topics: [
            "Steel Design", "Concrete Design", "Wood Design",
            "Structural Analysis", "Construction Methods",
            "Construction Materials", "Project Management",
            "Building Codes", "Seismic Design"
        ]
    }
};
const SECTION_REQUIREMENTS = {
    AMSTHEC: { total: 75 },
    HPGE: { total: 50 },
    PSAD: { total: 75 }
};
const SECTION_WEIGHTS = {
    AMSTHEC: 0.35,
    HPGE: 0.30,
    PSAD: 0.35
};
const PRC_INSTRUCTIONS = [
    "Read each question carefully.",
    "Choose the best answer from the given choices.",
    "Shade the corresponding letter on your answer sheet.",
    "Avoid erasures. Make sure of your answer before shading.",
    "Do not use any electronic devices during the examination.",
    "You are not allowed to leave the room once the exam has started."
];
const MOTIVATIONAL_QUOTES = [
    "The secret of getting ahead is getting started.",
    "Believe you can and you're halfway there.",
    "It does not matter how slowly you go as long as you do not stop.",
    "Success is the sum of small efforts, repeated day in and day out.",
    "The future belongs to those who believe in the beauty of their dreams."
];

// ======================
// STATE MANAGEMENT
// ======================
let appState = {
    view: 'loading',
    settings: JSON.parse(localStorage.getItem('examSettings')) || {
        theme: 'light',
        fontSize: 'medium',
        autoSave: true,
        navigationMode: 'scroll',
        showTimer: true,
        showProgress: true,
        randomizeQuestions: true,
        showDifficulty: true
    },
    answers: JSON.parse(localStorage.getItem('examAnswers')) || {},
    results: JSON.parse(localStorage.getItem('examResults')) || {},
    currentSection: null,
    timeLeft: 0,
    timerInterval: null,
    examQuestions: [],
    reviewingSection: null,
    fullQuestionBank: [],
    isPaused: false,
    firstWrongIndex: null,
    flaggedQuestions: JSON.parse(localStorage.getItem('examFlagged')) || {},
    questionNotes: JSON.parse(localStorage.getItem('examNotes')) || {},
    questionTimes: JSON.parse(localStorage.getItem('examTimes')) || {},
    questionDifficulty: JSON.parse(localStorage.getItem('examDifficulty')) || {},
    performanceData: JSON.parse(localStorage.getItem('performanceData')) || {},
    customExam: {
        sections: ['AMSTHEC', 'HPGE', 'PSAD'],
        randomize: true,
        difficulty: 'all',
        questionCount: 100,
        timeLimit: 4 * 60 * 60
    },
    autoSaveEnabled: true
};

// ======================
// QUESTION BANK MANAGEMENT
// ======================
async function loadQuestionBank() {
    try {
        const response = await fetch('question_bank.json');
        if (!response.ok) {
            throw new Error(`Failed to load question bank: ${response.status}`);
        }
        const questionBank = await response.json();
        console.log(`Loaded ${questionBank.length} questions from question bank`);
        
        // Add difficulty ratings to questions
        questionBank.forEach(q => {
            if (!q.difficulty) {
                // Default difficulty based on section
                if (q.section === 'AMSTHEC') q.difficulty = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];
                else if (q.section === 'HPGE') q.difficulty = ['medium', 'hard', 'hard'][Math.floor(Math.random() * 3)];
                else if (q.section === 'PSAD') q.difficulty = ['medium', 'medium', 'hard'][Math.floor(Math.random() * 3)];
            }
        });
        
        appState.fullQuestionBank = questionBank;
        return questionBank;
    } catch (error) {
        console.error('Error loading question bank:', error);
        appState.fullQuestionBank = getFallbackQuestions();
        return appState.fullQuestionBank;
    }
}

function getQuestionsForSection(sectionName) {
    if (!appState.fullQuestionBank || appState.fullQuestionBank.length === 0) {
        console.warn('Question bank not loaded, using fallback questions');
        return getSampleQuestions(sectionName);
    }
    
    // Get questions for this section
    let sectionQuestions = appState.fullQuestionBank.filter(q => q.section === sectionName);
    
    // Apply difficulty filter if in custom exam mode
    if (appState.view === 'custom-exam' && appState.customExam.difficulty !== 'all') {
        sectionQuestions = sectionQuestions.filter(q => q.difficulty === appState.customExam.difficulty);
    }
    
    // Process questions with groups
    const processedQuestions = processQuestionsWithGroups(sectionQuestions);
    
    // Apply custom exam question count if applicable
    const requiredTotal = (appState.view === 'custom-exam') 
        ? Math.min(processedQuestions.length, appState.customExam.questionCount) 
        : SECTION_REQUIREMENTS[sectionName].total;
    
    return processedQuestions.slice(0, requiredTotal);
}

function processQuestionsWithGroups(questions) {
    // First, group questions by group_id
    const groupMap = {};
    questions.forEach(question => {
        const gid = question.group_id;
        if (gid) {
            if (!groupMap[gid]) {
                groupMap[gid] = [];
            }
            groupMap[gid].push(question);
        } else {
            // For questions without group_id, create a unique ID
            const tempId = `__single_${Math.random().toString(36).substring(2, 10)}`;
            if (!groupMap[tempId]) {
                groupMap[tempId] = [];
            }
            groupMap[tempId].push(question);
        }
    });
    
    // Process each group to ensure "Situation" questions are first
    const processedGroups = Object.values(groupMap).map(group => {
        // Check if this is a valid situation group (should have 3 questions)
        const isSituationGroup = group.some(q => q.stem.trim().startsWith('Situation')) && group.length === 3;
        
        if (isSituationGroup) {
            // Sort the group to put Situation first
            return group.sort((a, b) => {
                if (a.stem.trim().startsWith('Situation')) return -1;
                if (b.stem.trim().startsWith('Situation')) return 1;
                return 0;
            });
        }
        
        // For non-situation groups, return as is
        return group;
    });
    
    // Now we have all questions organized into groups
    // We need to flatten the groups while preserving their internal order
    
    // First, separate into situation groups and standalone questions
    const situationGroups = [];
    const standaloneQuestions = [];
    
    processedGroups.forEach(group => {
        if (group.some(q => q.stem.trim().startsWith('Situation')) && group.length === 3) {
            situationGroups.push(group);
        } else {
            standaloneQuestions.push(...group);
        }
    });
    
    // Randomize the situation groups and standalone questions
    const randomizedSituationGroups = appState.settings.randomizeQuestions || (appState.view === 'custom-exam' && appState.customExam.randomize) 
        ? shuffleArray(situationGroups) 
        : situationGroups;
        
    const randomizedStandalone = appState.settings.randomizeQuestions || (appState.view === 'custom-exam' && appState.customExam.randomize) 
        ? shuffleArray(standaloneQuestions) 
        : standaloneQuestions;
    
    // Create final question list with situation groups first
    let finalQuestions = [];
    
    // Add situation groups
    randomizedSituationGroups.forEach(group => {
        finalQuestions.push(...group);
    });
    
    // Add standalone questions
    finalQuestions.push(...randomizedStandalone);
    
    // For better user experience, interleave situation groups with standalone questions
    if (appState.settings.randomizeQuestions || (appState.view === 'custom-exam' && appState.customExam.randomize)) {
        finalQuestions = [];
        
        const interleaved = [];
        let situationIndex = 0;
        let standaloneIndex = 0;
        
        // Alternate between situation groups and standalone questions
        while (situationIndex < randomizedSituationGroups.length || standaloneIndex < randomizedStandalone.length) {
            // Add 1 situation group (3 questions)
            if (situationIndex < randomizedSituationGroups.length) {
                interleaved.push(...randomizedSituationGroups[situationIndex]);
                situationIndex++;
            }
            
            // Add 1-2 standalone questions
            const numStandalone = Math.min(2, randomizedStandalone.length - standaloneIndex);
            if (numStandalone > 0) {
                for (let i = 0; i < numStandalone; i++) {
                    interleaved.push(randomizedStandalone[standaloneIndex + i]);
                }
                standaloneIndex += numStandalone;
            }
        }
        
        finalQuestions = interleaved;
    }
    
    return finalQuestions;
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// ======================
// UTILITY FUNCTIONS
// ======================
function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

function saveState() {
    localStorage.setItem('examAnswers', JSON.stringify(appState.answers));
    localStorage.setItem('examResults', JSON.stringify(appState.results));
    localStorage.setItem('examSettings', JSON.stringify(appState.settings));
    localStorage.setItem('examFlagged', JSON.stringify(appState.flaggedQuestions));
    localStorage.setItem('examNotes', JSON.stringify(appState.questionNotes));
    localStorage.setItem('examTimes', JSON.stringify(appState.questionTimes));
    localStorage.setItem('examDifficulty', JSON.stringify(appState.questionDifficulty));
    localStorage.setItem('performanceData', JSON.stringify(appState.performanceData));
    localStorage.setItem('customExam', JSON.stringify(appState.customExam));
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    const screen = document.getElementById(`screen-${screenId}`);
    if (screen) {
        screen.classList.remove('hidden');
        appState.view = screenId;
        if (screenId === 'main-menu') {
            renderMainMenu();
        } else if (screenId === 'instructions') {
            renderInstructions();
        } else if (screenId === 'exam') {
            renderExam();
        } else if (screenId === 'settings') {
            renderSettingsScreen();
        } else if (screenId === 'results') {
            // Auto-scroll to top when showing results
            window.scrollTo(0, 0);
            renderResultsScreen();
        } else if (screenId === 'review') {
            // Handled by showReviewScreen()
        } else if (screenId === 'custom-exam') {
            renderCustomExamBuilder();
        }
    }
}

// ======================
// TIMER & QUESTION LOADING
// ======================
function loadQuestionsForSection(sectionName) {
    const savedKey = `examQuestions_${sectionName}`;
    const savedQuestions = localStorage.getItem(savedKey);
    let sectionQuestions;
    if (savedQuestions) {
        sectionQuestions = JSON.parse(savedQuestions);
    } else {
        sectionQuestions = getQuestionsForSection(sectionName);
        localStorage.setItem(savedKey, JSON.stringify(sectionQuestions));
    }
    appState.examQuestions = sectionQuestions;
    if (!appState.answers[sectionName]) {
        appState.answers[sectionName] = new Array(sectionQuestions.length).fill(null);
    }
    if (!appState.isPaused) {
        appState.timeLeft = SECTIONS[sectionName].time;
    } else {
        // Restore previous time if paused
        const savedTime = localStorage.getItem(`examTime_${sectionName}`);
        if (savedTime) {
            appState.timeLeft = parseInt(savedTime);
        }
    }
    
    // Initialize question times
    if (!appState.questionTimes[sectionName]) {
        appState.questionTimes[sectionName] = new Array(sectionQuestions.length).fill(0);
    }
    
    // Initialize flagged questions
    if (!appState.flaggedQuestions[sectionName]) {
        appState.flaggedQuestions[sectionName] = new Array(sectionQuestions.length).fill(false);
    }
    
    // Initialize notes
    if (!appState.questionNotes[sectionName]) {
        appState.questionNotes[sectionName] = new Array(sectionQuestions.length).fill('');
    }
    
    // Initialize difficulty ratings
    if (!appState.questionDifficulty[sectionName]) {
        appState.questionDifficulty[sectionName] = new Array(sectionQuestions.length).fill('medium');
    }
    
    // Initialize performance data
    if (!appState.performanceData[sectionName]) {
        appState.performanceData[sectionName] = {
            difficultyDistribution: {
                easy: 0,
                medium: 0,
                hard: 0
            },
            topicPerformance: {},
            answerPatterns: {
                commonMistakes: []
            }
        };
    }
    
    if (document.getElementById('exam-timer')) {
        document.getElementById('exam-timer').textContent = formatTime(appState.timeLeft);
    }
    if (!appState.isPaused) {
        startTimer();
    }
}

function startTimer() {
    clearInterval(appState.timerInterval);
    if (appState.isPaused) return;
    
    let lastQuestionTime = Date.now();
    
    appState.timerInterval = setInterval(() => {
        appState.timeLeft--;
        if (document.getElementById('exam-timer')) {
            document.getElementById('exam-timer').textContent = formatTime(appState.timeLeft);
        }
        if (appState.timeLeft <= 0) {
            clearInterval(appState.timerInterval);
            submitExam();
        }
        
        // Track time spent on current question
        const currentQuestionIndex = getCurrentQuestionIndex();
        if (currentQuestionIndex !== -1) {
            const now = Date.now();
            const timeSpent = Math.floor((now - lastQuestionTime) / 1000);
            lastQuestionTime = now;
            
            if (!appState.questionTimes[appState.currentSection]) {
                appState.questionTimes[appState.currentSection] = new Array(appState.examQuestions.length).fill(0);
            }
            appState.questionTimes[appState.currentSection][currentQuestionIndex] += timeSpent;
            saveState();
        }
    }, 1000);
}

function getCurrentQuestionIndex() {
    if (appState.settings.navigationMode === 'step') {
        const activeCard = document.querySelector('.question-card.active-question');
        if (activeCard) {
            return parseInt(activeCard.id.split('-')[1]);
        }
    } else {
        const questionCards = document.querySelectorAll('.question-card');
        if (questionCards.length > 0) {
            const firstVisible = Array.from(questionCards).find(card => {
                const rect = card.getBoundingClientRect();
                return rect.top >= 0 && rect.top <= window.innerHeight;
            });
            if (firstVisible) {
                return parseInt(firstVisible.id.split('-')[1]);
            }
        }
    }
    return -1;
}

function pauseTimer() {
    clearInterval(appState.timerInterval);
    appState.isPaused = true;
    saveState();
    
    // Save remaining time for this section
    if (appState.currentSection) {
        localStorage.setItem(`examTime_${appState.currentSection}`, appState.timeLeft.toString());
    }
}

// ======================
// RESET
// ======================
function resetExam() {
    if (!confirm('Are you sure you want to reset all exam data? This cannot be undone.')) return;
    clearInterval(appState.timerInterval);
    appState.answers = {};
    appState.results = {};
    appState.timeLeft = 0;
    appState.currentSection = null;
    appState.isPaused = false;
    appState.firstWrongIndex = null;
    appState.flaggedQuestions = {};
    appState.questionNotes = {};
    appState.questionTimes = {};
    appState.questionDifficulty = {};
    appState.performanceData = {};
    appState.customExam = {
        sections: ['AMSTHEC', 'HPGE', 'PSAD'],
        randomize: true,
        difficulty: 'all',
        questionCount: 100,
        timeLimit: 4 * 60 * 60
    };
    
    localStorage.removeItem('examAnswers');
    localStorage.removeItem('examResults');
    localStorage.removeItem('examSettings');
    localStorage.removeItem('examFlagged');
    localStorage.removeItem('examNotes');
    localStorage.removeItem('examTimes');
    localStorage.removeItem('examDifficulty');
    localStorage.removeItem('performanceData');
    localStorage.removeItem('customExam');
    
    Object.keys(SECTIONS).forEach(sectionName => {
        localStorage.removeItem(`examQuestions_${sectionName}`);
        localStorage.removeItem(`examTime_${sectionName}`);
    });
    
    showScreen('main-menu');
}

// ======================
// CUSTOM EXAM BUILDER
// ======================
function renderCustomExamBuilder() {
    // Set up initial values
    document.getElementById('amsthec-include').checked = appState.customExam.sections.includes('AMSTHEC');
    document.getElementById('hpge-include').checked = appState.customExam.sections.includes('HPGE');
    document.getElementById('psad-include').checked = appState.customExam.sections.includes('PSAD');
    
    document.getElementById('randomize-questions').checked = appState.customExam.randomize;
    document.getElementById('include-timer').checked = true; // Always include timer for custom exams
    document.getElementById('difficulty-filter').value = appState.customExam.difficulty;
    
    document.getElementById('question-count').value = appState.customExam.questionCount;
    document.getElementById('question-count-value').textContent = appState.customExam.questionCount;
    
    const timeHours = Math.floor(appState.customExam.timeLimit / 3600);
    document.getElementById('time-limit').value = timeHours;
    document.getElementById('time-limit-value').textContent = `${timeHours} hours`;
    
    // Set up event listeners
    document.getElementById('question-count').oninput = function() {
        document.getElementById('question-count-value').textContent = this.value;
        appState.customExam.questionCount = parseInt(this.value);
        saveState();
    };
    
    document.getElementById('time-limit').oninput = function() {
        const hours = parseInt(this.value);
        document.getElementById('time-limit-value').textContent = `${hours} hours`;
        appState.customExam.timeLimit = hours * 3600;
        saveState();
    };
    
    document.getElementById('difficulty-filter').onchange = function() {
        appState.customExam.difficulty = this.value;
        saveState();
    };
    
    document.getElementById('randomize-questions').onchange = function() {
        appState.customExam.randomize = this.checked;
        saveState();
    };
    
    // Section checkboxes
    document.getElementById('amsthec-include').onchange = function() {
        updateCustomExamSections();
    };
    
    document.getElementById('hpge-include').onchange = function() {
        updateCustomExamSections();
    };
    
    document.getElementById('psad-include').onchange = function() {
        updateCustomExamSections();
    };
    
    // Button actions
    document.getElementById('btn-custom-exam-back').onclick = () => showScreen('main-menu');
    document.getElementById('btn-create-custom-exam').onclick = createCustomExam;
}

function updateCustomExamSections() {
    const sections = [];
    if (document.getElementById('amsthec-include').checked) sections.push('AMSTHEC');
    if (document.getElementById('hpge-include').checked) sections.push('HPGE');
    if (document.getElementById('psad-include').checked) sections.push('PSAD');
    
    appState.customExam.sections = sections;
    saveState();
}

function createCustomExam() {
    if (appState.customExam.sections.length === 0) {
        alert('Please select at least one section for your custom exam.');
        return;
    }
    
    // Create a combined exam from selected sections
    let allQuestions = [];
    let totalQuestions = 0;
    
    appState.customExam.sections.forEach(sectionName => {
        const sectionQuestions = getQuestionsForSection(sectionName);
        allQuestions = allQuestions.concat(sectionQuestions);
        totalQuestions += sectionQuestions.length;
    });
    
    // Shuffle and limit to requested count
    allQuestions = shuffleArray(allQuestions);
    allQuestions = allQuestions.slice(0, appState.customExam.questionCount);
    
    // Set up exam state
    appState.currentSection = 'CUSTOM';
    appState.examQuestions = allQuestions;
    appState.timeLeft = appState.customExam.timeLimit;
    
    // Initialize answer tracking
    appState.answers.CUSTOM = new Array(allQuestions.length).fill(null);
    appState.flaggedQuestions.CUSTOM = new Array(allQuestions.length).fill(false);
    appState.questionNotes.CUSTOM = new Array(allQuestions.length).fill('');
    appState.questionTimes.CUSTOM = new Array(allQuestions.length).fill(0);
    
    // Start the exam
    saveState();
    showScreen('exam');
    startTimer();
}

// ======================
// MAIN MENU
// ======================
function renderMainMenu() {
    const completedCount = Object.keys(appState.results).length;
    document.getElementById('progress-text').textContent = `${completedCount}/3 sections completed`;
    const grid = document.getElementById('section-grid');
    grid.innerHTML = '';
    Object.values(SECTIONS).forEach((section, idx) => {
        const isCompleted = appState.results[section.name] !== undefined;
        const isPaused = appState.isPaused && appState.currentSection === section.name;
        const score = isCompleted ? appState.results[section.name].score_pct : null;
        const card = document.createElement('div');
        card.className = 'section-card';
        
        // Determine button text and class
        let buttonText = '';
        let buttonClass = '';
        let timerDisplay = '';
        
        if (isCompleted) {
            buttonText = 'Review Section';
            buttonClass = 'btn-secondary';
        } else if (isPaused) {
            buttonText = 'Continue Section';
            buttonClass = 'btn-primary';
            const timeDisplay = formatTime(appState.timeLeft);
            timerDisplay = `<p class="paused-timer" style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-muted-light)">⏳ Time left: ${timeDisplay}</p>`;
        } else {
            buttonText = 'Start Section';
            buttonClass = 'btn-primary';
        }
        
        card.innerHTML = `
            <div class="section-card-header">
                <h2 class="section-card-title">
                    <span>${['📐','🗺️','📊'][idx % 3]}</span>
                    ${section.name}
                </h2>
                ${isCompleted ? `<span class="section-card-score">${score.toFixed(1)}%</span>` : ''}
            </div>
            <p class="section-card-description">${section.title}</p>
            ${timerDisplay}
            <button type="button" class="btn ${buttonClass}" data-action="${isCompleted ? 'review' : (isPaused ? 'continue' : 'start')}" data-section="${section.name}">
                ${buttonText}
            </button>
            ${isCompleted ? `
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${score}%"></div>
                </div>
            ` : ''}
        `;
        
        grid.appendChild(card);
    });

    // Add event listeners
    document.querySelectorAll('[data-action="start"], [data-action="continue"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionName = e.target.dataset.section;
            appState.currentSection = sectionName;
            showScreen('instructions');
        });
    });
    
    document.querySelectorAll('[data-action="review"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionName = e.target.dataset.section;
            showReviewScreen(sectionName);
        });
    });
    
    // Set up other buttons
    document.getElementById('btn-custom-exam').addEventListener('click', () => showScreen('custom-exam'));
    document.getElementById('btn-settings').addEventListener('click', () => showScreen('settings'));
    document.getElementById('btn-download-pdf').addEventListener('click', generateOfflinePDF);
    document.getElementById('btn-reset').addEventListener('click', resetExam);
}

// ======================
// INSTRUCTIONS SCREEN
// ======================
function renderInstructions() {
    const section = SECTIONS[appState.currentSection];
    document.getElementById('instruction-section-title').textContent = section.title;
    const instrList = document.getElementById('prc-instructions');
    instrList.innerHTML = '';
    [...PRC_INSTRUCTIONS,
        `This section has <strong>${section.total} questions</strong>.`,
        `You have <strong>${section.time / 3600} hours</strong> to complete this section.`
    ].forEach(instr => {
        const li = document.createElement('li');
        li.innerHTML = instr;
        instrList.appendChild(li);
    });
    const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    document.getElementById('motivational-quote').textContent = `"${quote}"`;
    
    // Set up button actions
    document.getElementById('btn-instructions-back').onclick = () => showScreen('main-menu');
    document.getElementById('btn-start-exam').onclick = () => {
        if (!appState.isPaused) {
            loadQuestionsForSection(appState.currentSection);
        }
        appState.isPaused = false;
        showScreen('exam');
        startTimer();
    };
}

// ======================
// EXAM SCREEN
// ======================
function renderExam() {
    const section = appState.currentSection === 'CUSTOM' 
        ? { title: 'Custom Exam' } 
        : SECTIONS[appState.currentSection];
    
    const totalQuestions = appState.examQuestions.length;
    document.getElementById('exam-section-title').textContent = section.title;
    document.getElementById('exam-progress').textContent = `Question 1 of ${totalQuestions}`;
    
    // Apply theme and font size
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize} nav-${appState.settings.navigationMode}`;
    
    const container = document.getElementById('exam-questions-container');
    container.innerHTML = '';
    
    // Render all questions
    appState.examQuestions.forEach((question, index) => {
        const userAnswer = appState.answers[appState.currentSection][index];
        const isFlagged = appState.flaggedQuestions[appState.currentSection]?.[index] || false;
        const timeSpent = appState.questionTimes[appState.currentSection]?.[index] || 0;
        const formattedTime = timeSpent > 0 
            ? `(${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s)` 
            : '';
        const difficulty = appState.questionDifficulty[appState.currentSection]?.[index] || 'medium';
        
        const questionCard = document.createElement('div');
        questionCard.className = `question-card ${isFlagged ? 'flagged-question' : ''}`;
        questionCard.id = `question-${index}`;
        if (appState.settings.navigationMode === 'step' && index === 0) {
            questionCard.classList.add('active-question');
        }

        questionCard.innerHTML = `
            <div class="question-header">
                <div>
                    <p class="question-number">Question ${index + 1}${isFlagged ? '<span class="flagged-indicator"></span>' : ''}
                        <span class="difficulty-badge difficulty-${difficulty}">${difficulty.charAt(0).toUpperCase()}</span>
                    </p>
                    <p class="time-spent">${formattedTime}</p>
                    ${question.group_id && question.stem.trim().startsWith('Situation') ? `<p class="question-group">Situation: ${question.group_id}</p>` : (question.group_id ? `<p class="question-group">Problem from Situation ${question.group_id}</p>` : '')}
                </div>
            </div>
            <p class="question-stem whitespace-pre-wrap">${question.stem}</p>
            ${question.figure ? `<div class="question-image"><img src="${question.figure}" alt="Figure for question ${index + 1}" data-figure="${question.figure}"></div>` : ''}
            <div class="choices-container">
                ${question.choices.map((choice, choiceIndex) => {
                    const letter = String.fromCharCode(65 + choiceIndex);
                    const isSelected = userAnswer === letter;
                    return `<button type="button" class="choice-btn ${isSelected ? 'selected' : ''}" data-question="${index}" data-choice="${letter}">
                        <span class="choice-letter">${letter}.</span>
                        <span>${choice.trim()}</span>
                    </button>`;
                }).join('')}
            </div>
            <div class="question-actions mt-4">
                <button type="button" class="btn btn-secondary btn-sm toggle-flag" data-question="${index}">
                    ${isFlagged ? 'Remove Flag' : 'Flag Question'}
                </button>
                <button type="button" class="btn btn-secondary btn-sm show-note" data-question="${index}">
                    Add Note
                </button>
            </div>
            <div class="note-container hidden" data-note="${index}">
                <div class="note-header">
                    <span>Notes</span>
                    <button type="button" class="btn btn-sm btn-primary save-note" data-question="${index}">Save</button>
                </div>
                <textarea class="note-textarea" placeholder="Enter your notes here...">${appState.questionNotes[appState.currentSection]?.[index] || ''}</textarea>
            </div>
        `;
        container.appendChild(questionCard);
    });

    // Add event listeners for choices
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.target.closest('.choice-btn');
            const questionIndex = parseInt(btnEl.dataset.question);
            const choice = btnEl.dataset.choice;
            selectAnswer(questionIndex, choice);
            
            // Visual feedback
            const questionCard = document.getElementById(`question-${questionIndex}`);
            questionCard.querySelectorAll('.choice-btn').forEach(choiceBtn => {
                choiceBtn.classList.remove('selected');
            });
            btnEl.classList.add('selected');
            
            // Navigation
            if (appState.settings.navigationMode === 'scroll') {
                const nextIndex = questionIndex + 1;
                if (nextIndex < totalQuestions) {
                    const nextEl = document.getElementById(`question-${nextIndex}`);
                    if (nextEl) {
                        const header = document.querySelector('.exam-header');
                        const headerHeight = header ? header.offsetHeight : 60;
                        const elementPosition = nextEl.getBoundingClientRect().top + window.scrollY;
                        const offsetPosition = elementPosition - headerHeight - 10;
                        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                    }
                }
            } else if (appState.settings.navigationMode === 'step') {
                navigateStep(1);
            }
            
            // Auto-save
            if (appState.settings.autoSave) {
                saveState();
            }
        });
    });

    // Add flagging functionality
    document.querySelectorAll('.toggle-flag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const questionIndex = parseInt(e.target.dataset.question);
            const isFlagged = !appState.flaggedQuestions[appState.currentSection][questionIndex];
            appState.flaggedQuestions[appState.currentSection][questionIndex] = isFlagged;
            saveState();
            
            // Update UI
            const questionCard = document.getElementById(`question-${questionIndex}`);
            if (isFlagged) {
                questionCard.classList.add('flagged-question');
                questionCard.querySelector('.question-number').innerHTML = `Question ${questionIndex + 1}<span class="flagged-indicator"></span>
                    <span class="difficulty-badge difficulty-${appState.questionDifficulty[appState.currentSection][questionIndex]}">${appState.questionDifficulty[appState.currentSection][questionIndex].charAt(0).toUpperCase()}</span>
                `;
                btn.textContent = 'Remove Flag';
            } else {
                questionCard.classList.remove('flagged-question');
                questionCard.querySelector('.question-number').innerHTML = `Question ${questionIndex + 1}
                    <span class="difficulty-badge difficulty-${appState.questionDifficulty[appState.currentSection][questionIndex]}">${appState.questionDifficulty[appState.currentSection][questionIndex].charAt(0).toUpperCase()}</span>
                `;
                btn.textContent = 'Flag Question';
            }
        });
    });

    // Add note-taking functionality
    document.querySelectorAll('.show-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const questionIndex = parseInt(e.target.dataset.question);
            const noteContainer = document.querySelector(`.note-container[data-note="${questionIndex}"]`);
            noteContainer.classList.toggle('hidden');
        });
    });

    document.querySelectorAll('.save-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const questionIndex = parseInt(e.target.dataset.question);
            const textarea = document.querySelector(`.note-container[data-note="${questionIndex}"] textarea`);
            const note = textarea.value;
            
            if (!appState.questionNotes[appState.currentSection]) {
                appState.questionNotes[appState.currentSection] = new Array(appState.examQuestions.length).fill('');
            }
            appState.questionNotes[appState.currentSection][questionIndex] = note;
            saveState();
            
            // Show confirmation
            const btnText = btn.textContent;
            btn.textContent = 'Saved!';
            setTimeout(() => {
                btn.textContent = btnText;
            }, 1000);
        });
    });

    // Add image zoom functionality
    document.querySelectorAll('img[data-figure]').forEach(img => {
        img.addEventListener('click', () => {
            document.getElementById('zoomed-image').src = img.src;
            document.getElementById('image-modal').classList.remove('hidden');
        });
    });

    // Button actions
    document.getElementById('btn-pause-resume').onclick = () => {
        if (appState.isPaused) {
            appState.isPaused = false;
            startTimer();
            document.getElementById('btn-pause-resume').innerHTML = `
                <svg class="icon" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"></path>
                </svg> Pause
            `;
        } else {
            pauseTimer();
            document.getElementById('btn-pause-resume').innerHTML = `
                <svg class="icon" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
                </svg> Resume
            `;
        }
    };

    document.getElementById('btn-submit-exam').onclick = () => {
        showConfirmModal(
            "Confirm Submission",
            "Are you sure you want to submit this exam section? You won't be able to change your answers after submission.",
            submitExam
        );
    };

    document.getElementById('btn-jump-to-first').onclick = jumpToFirstUnanswered;

    document.getElementById('btn-nav-next').onclick = () => {
        navigateStep(1);
    };

    // Keyboard navigation for step mode
    if (appState.settings.navigationMode === 'step') {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                navigateStep(1);
            } else if (e.key === 'ArrowLeft') {
                navigateStep(-1);
            } else if (e.key === 'f' || e.key === 'F') {
                // Flag current question (F key)
                const activeCard = document.querySelector('.question-card.active-question');
                if (activeCard) {
                    const index = parseInt(activeCard.id.split('-')[1]);
                    const flagBtn = activeCard.querySelector('.toggle-flag');
                    if (flagBtn) flagBtn.click();
                }
            }
        });
    }
}

function selectAnswer(questionIndex, choice) {
    if (appState.currentSection === null) return;
    appState.answers[appState.currentSection][questionIndex] = choice;
    if (appState.settings.autoSave) {
        saveState();
    }
}

function navigateStep(direction) {
    const activeCard = document.querySelector('.question-card.active-question');
    if (!activeCard) return;
    
    let currentIndex = parseInt(activeCard.id.split('-')[1]);
    let nextIndex = currentIndex + direction;
    
    if (nextIndex >= 0 && nextIndex < appState.examQuestions.length) {
        activeCard.classList.remove('active-question');
        const nextCard = document.getElementById(`question-${nextIndex}`);
        if (nextCard) {
            nextCard.classList.add('active-question');
            document.getElementById('exam-progress').textContent = `Question ${nextIndex + 1} of ${appState.examQuestions.length}`;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } else if (nextIndex >= appState.examQuestions.length) {
        showConfirmModal(
            "Section Completed",
            "You have reached the end of the section. Do you want to submit your exam now?",
            submitExam
        );
    }
}

function jumpToFirstUnanswered() {
    const sectionName = appState.currentSection;
    const answers = appState.answers[sectionName];
    const firstUnansweredIndex = answers.findIndex(answer => answer === null);
    
    if (firstUnansweredIndex === -1) {
        alert("All questions have been answered!");
        return;
    }
    
    const targetEl = document.getElementById(`question-${firstUnansweredIndex}`);
    if (targetEl) {
        const header = document.querySelector('.exam-header');
        const headerHeight = header ? header.offsetHeight : 60;
        const elementPosition = targetEl.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - headerHeight - 10;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
}

// ======================
// SUBMIT EXAM
// ======================
function submitExam() {
    clearInterval(appState.timerInterval);
    const sectionName = appState.currentSection;
    const questions = appState.examQuestions;
    const answers = appState.answers[sectionName];
    
    let correctCount = 0;
    const wrongAnswers = [];
    const topicPerformance = {};
    
    // Initialize topic performance tracking
    const section = sectionName === 'CUSTOM' ? { topics: [] } : SECTIONS[sectionName];
    if (section.topics) {
        section.topics.forEach(topic => {
            topicPerformance[topic] = {
                total: 0,
                correct: 0
            };
        });
    }
    
    questions.forEach((question, index) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === question.correct_answer;
        
        // Track topic performance
        if (section.topics && question.topic && topicPerformance[question.topic]) {
            topicPerformance[question.topic].total++;
            if (isCorrect) topicPerformance[question.topic].correct++;
        }
        
        if (isCorrect) {
            correctCount++;
        } else {
            wrongAnswers.push({
                number: index + 1,
                stem: question.stem,
                user_answer: userAnswer,
                correct_answer: question.correct_answer,
                choices: question.choices,
                explanation: question.explanation,
                figure: question.figure,
                group_id: question.group_id,
                time_spent: appState.questionTimes[sectionName][index],
                flagged: appState.flaggedQuestions[sectionName][index],
                notes: appState.questionNotes[sectionName][index],
                difficulty: appState.questionDifficulty[sectionName][index],
                topic: question.topic
            });
        }
        
        // Track performance data for future analysis
        if (!appState.performanceData[sectionName]) {
            appState.performanceData[sectionName] = {
                difficultyDistribution: {
                    easy: 0,
                    medium: 0,
                    hard: 0
                },
                topicPerformance: {},
                answerPatterns: {
                    commonMistakes: []
                }
            };
        }
        
        const difficulty = question.difficulty || 'medium';
        appState.performanceData[sectionName].difficultyDistribution[difficulty]++;
        
        if (question.topic) {
            if (!appState.performanceData[sectionName].topicPerformance[question.topic]) {
                appState.performanceData[sectionName].topicPerformance[question.topic] = {
                    total: 0,
                    correct: 0
                };
            }
            appState.performanceData[sectionName].topicPerformance[question.topic].total++;
            if (isCorrect) {
                appState.performanceData[sectionName].topicPerformance[question.topic].correct++;
            }
        }
    });

    // Calculate answer patterns
    const answerPatterns = analyzeAnswerPatterns(questions, answers);
    
    if (wrongAnswers.length > 0) {
        appState.firstWrongIndex = wrongAnswers[0].number - 1;
    } else {
        appState.firstWrongIndex = null;
    }

    const score_pct = (correctCount / questions.length) * 100;
    appState.results[sectionName] = {
        score_pct,
        correct: correctCount,
        total: questions.length,
        wrong: wrongAnswers,
        timestamp: new Date().toISOString(),
        topicPerformance: topicPerformance,
        answerPatterns: answerPatterns
    };
    
    appState.isPaused = false;
    saveState();
    showScreen('results');
}

// ======================
// ANSWER PATTERN ANALYSIS
// ======================
function analyzeAnswerPatterns(questions, answers) {
    const patterns = {
        commonMistakes: [],
        streakAnalysis: [],
        timeAnalysis: {
            timePerQuestion: {
                easy: { min: 0, max: 0, avg: 0 },
                medium: { min: 0, max: 0, avg: 0 },
                hard: { min: 0, max: 0, avg: 0 }
            },
            timeToCorrect: 0,
            timeToWrong: 0
        },
        topicPerformance: {}
    };
    
    // Analyze common mistakes
    const mistakeMap = {};
    questions.forEach((q, index) => {
        const userAnswer = answers[index];
        if (userAnswer !== null && userAnswer !== q.correct_answer) {
            const mistakeKey = `${q.id}-${userAnswer}`;
            if (!mistakeMap[mistakeKey]) {
                mistakeMap[mistakeKey] = {
                    count: 0,
                    question: q,
                    userAnswer: userAnswer
                };
            }
            mistakeMap[mistakeKey].count++;
        }
    });
    
    // Get top 3 common mistakes
    const mistakesArray = Object.values(mistakeMap).sort((a, b) => b.count - a.count).slice(0, 3);
    mistakesArray.forEach(mistake => {
        patterns.commonMistakes.push({
            question: mistake.question,
            userAnswer: mistake.userAnswer,
            correctAnswer: mistake.question.correct_answer,
            count: mistake.count
        });
    });
    
    // Analyze streaks
    let currentStreak = 0;
    let maxStreak = 0;
    let currentStreakType = null;
    
    questions.forEach((q, index) => {
        const isCorrect = answers[index] === q.correct_answer;
        if (isCorrect) {
            if (currentStreakType === 'correct') {
                currentStreak++;
            } else {
                if (currentStreak > maxStreak && currentStreakType === 'correct') {
                    maxStreak = currentStreak;
                }
                currentStreak = 1;
                currentStreakType = 'correct';
            }
        } else {
            if (currentStreakType === 'wrong') {
                currentStreak++;
            } else {
                if (currentStreak > maxStreak && currentStreakType === 'wrong') {
                    maxStreak = currentStreak;
                }
                currentStreak = 1;
                currentStreakType = 'wrong';
            }
        }
    });
    
    patterns.streakAnalysis.push({
        maxCorrectStreak: maxStreak,
        maxWrongStreak: maxStreak
    });
    
    return patterns;
}

// ======================
// RESULTS SCREEN
// ======================
function renderResultsScreen() {
    const sectionName = appState.currentSection;
    const result = appState.results[sectionName];
    const section = sectionName === 'CUSTOM' 
        ? { title: 'Custom Exam' } 
        : SECTIONS[sectionName];
    const passed = result.score_pct >= 70;
    
    // Update results elements
    document.getElementById('results-section-title').textContent = section.title;
    document.getElementById('score-message').textContent = passed 
        ? 'Congratulations! You Passed!' 
        : 'Review Required. You Did Not Pass.';
    
    document.getElementById('results-score').className = `score ${passed ? 'pass' : 'fail'}`;
    document.getElementById('results-score').textContent = `${result.score_pct.toFixed(1)}%`;
    
    document.getElementById('total-questions').textContent = result.total;
    document.getElementById('correct-answers').textContent = result.correct;
    document.getElementById('wrong-answers').textContent = result.total - result.correct;
    
    // Show/hide wrong answers section
    const wrongAnswersSection = document.getElementById('wrong-answers-section');
    if (result.wrong.length > 0) {
        wrongAnswersSection.classList.remove('hidden');
        const wrongAnswersList = document.getElementById('wrong-answers-list');
        wrongAnswersList.innerHTML = '';
        
        result.wrong.forEach(wrong => {
            let choicesHtml = '';
            wrong.choices.forEach((choice, index) => {
                const letter = String.fromCharCode(65 + index);
                const isCorrect = letter === wrong.correct_answer;
                const isUser = letter === wrong.user_answer && !isCorrect;
                const bgClass = isCorrect ? 'bg-green-100' : (isUser ? 'bg-red-100' : '');
                const borderClass = isCorrect ? 'border-green-500' : (isUser ? 'border-red-500' : 'border-gray-200');
                
                choicesHtml += `
                    <div class="choice-btn ${bgClass} ${borderClass}">
                        <span class="choice-letter">${letter}.</span>
                        <span>${choice.trim()}</span>
                    </div>
                `;
            });
            
            const wrongCard = document.createElement('div');
            wrongCard.className = 'wrong-answer-card';
            wrongCard.innerHTML = `
                <div class="question-header">
                    <p class="question-number">Question ${wrong.number}</p>
                    ${wrong.group_id ? `<p class="question-group">Problem from Situation ${wrong.group_id}</p>` : ''}
                </div>
                <p class="question-stem whitespace-pre-wrap">${wrong.stem}</p>
                ${wrong.figure ? `<div class="question-image"><img src="${wrong.figure}" alt="Figure for question ${wrong.number}" data-figure="${wrong.figure}"></div>` : ''}
                <div class="choices-container">${choicesHtml}</div>
                <div class="answer-comparison">
                    <p class="user-answer">Your Answer: ${wrong.user_answer || "Not Answered"}</p>
                    <p class="correct-answer">Correct Answer: ${wrong.correct_answer}</p>
                    ${wrong.explanation ? `<div class="explanation"><p class="explanation-title">Explanation:</p><p class="whitespace-pre-wrap">${wrong.explanation}</p></div>` : ''}
                </div>
                <div class="question-meta mt-2">
                    <p>Time spent: ${Math.floor(wrong.time_spent / 60)}m ${wrong.time_spent % 60}s</p>
                    <p>Difficulty: <span class="difficulty-badge difficulty-${wrong.difficulty}">${wrong.difficulty}</span></p>
                    ${wrong.notes ? `<p>Note: ${wrong.notes}</p>` : ''}
                    <button type="button" class="btn btn-primary btn-sm mt-2 view-solution">View Solution</button>
                </div>
            `;
            
            // Add solution button functionality
            wrongCard.querySelector('.view-solution').addEventListener('click', () => {
                showSolution(wrong);
            });
            
            wrongAnswersList.appendChild(wrongCard);
        });
    } else {
        wrongAnswersSection.classList.add('hidden');
    }
    
    // Render performance heatmap
    renderPerformanceHeatmap(result);
    
    // Generate study focus recommendations
    renderStudyFocusRecommendations(result);
    
    // Set up button actions
    document.getElementById('btn-results-main-menu').onclick = () => showScreen('main-menu');
    document.getElementById('btn-review-section').onclick = () => showReviewScreen(sectionName);
}

// ======================
// SOLUTION TEMPLATE
// ======================
function showSolution(wrongQuestion) {
    // Create solution modal
    const solutionModal = document.createElement('div');
    solutionModal.className = 'modal-overlay';
    solutionModal.style.zIndex = 60;
    solutionModal.innerHTML = `
        <div class="modal-content" style="max-width: 80%; max-height: 80vh; overflow-y: auto; position: relative;">
            <h2 class="section-title">Question ${wrongQuestion.number}</h2>
            
            <div class="question-stem mb-4">${wrongQuestion.stem}</div>
            
            <div class="solution-header mb-4">
                <h3>Solution</h3>
                <button type="button" class="btn btn-primary close-solution">Close</button>
            </div>
            
            <div class="solution-content">
                <div class="solution-steps">
                    <h4>Step 1: Understanding the Problem</h4>
                    <p>${wrongQuestion.solution?.step1 || 'This is where the explanation would begin, breaking down how to approach the question.'}</p>
                    
                    <h4>Step 2: Key Formulas</h4>
                    <p>${wrongQuestion.solution?.step2 || 'Relevant formulas would be listed here with explanations of each variable.'}</p>
                    
                    <h4>Step 3: Calculation</h4>
                    <p>${wrongQuestion.solution?.step3 || 'Detailed calculation process showing how to arrive at the answer.'}</p>
                    
                    <h4>Step 4: Final Answer</h4>
                    <p>${wrongQuestion.solution?.step4 || 'Explanation of why the answer is correct and common pitfalls to avoid.'}</p>
                </div>
                
                <div class="solution-note mt-4">
                    <h4>Pro Tip:</h4>
                    <p>${wrongQuestion.solution?.proTip || 'This is where additional tips and insights would be provided to help you understand the concept better.'}</p>
                </div>
                
                <div class="solution-footer mt-4">
                    <div class="solution-rating">
                        <span>Difficulty:</span>
                        <span class="difficulty-badge difficulty-${wrongQuestion.difficulty}">${wrongQuestion.difficulty.charAt(0).toUpperCase()}</span>
                    </div>
                    <div class="solution-topic">
                        <span>Topic:</span>
                        <span class="topic-badge">${wrongQuestion.topic || 'General'}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(solutionModal);
    
    // Close button
    solutionModal.querySelector('.close-solution').addEventListener('click', () => {
        document.body.removeChild(solutionModal);
    });
    
    // Auto-scroll to top
    window.scrollTo(0, 0);
}

function renderPerformanceHeatmap(result) {
    const ctx = document.getElementById('performance-heatmap').getContext('2d');
    const section = result.section || 'CUSTOM';
    const topics = section === 'CUSTOM' 
        ? Object.keys(result.topicPerformance).slice(0, 20) 
        : SECTIONS[section]?.topics || Object.keys(result.topicPerformance);
    
    // Calculate performance data
    const data = topics.map(topic => {
        const perf = result.topicPerformance[topic];
        if (perf && perf.total > 0) {
            return (perf.correct / perf.total) * 100;
        }
        return 0;
    });
    
    // Create heatmap visualization
    const canvas = document.getElementById('performance-heatmap');
    const width = canvas.width;
    const height = canvas.height;
    const cellWidth = width / Math.min(20, topics.length);
    const cellHeight = height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw heatmap cells
    data.forEach((percentage, index) => {
        let color;
        if (percentage < 50) {
            color = 'rgba(220, 38, 38, 0.7)'; // Red
        } else if (percentage < 75) {
            color = 'rgba(245, 158, 11, 0.7)'; // Yellow
        } else {
            color = 'rgba(16, 185, 129, 0.7)'; // Green
        }
        
        ctx.fillStyle = color;
        ctx.fillRect(index * cellWidth, 0, cellWidth - 2, cellHeight);
        
        // Add labels
        if (index < topics.length) {
            ctx.fillStyle = '#000';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(topics[index], index * cellWidth + cellWidth/2, height - 10);
        }
    });
}

function renderStudyFocusRecommendations(result) {
    const container = document.getElementById('study-focus-container');
    container.innerHTML = '';
    
    // Get topic performance data
    const topicPerformance = result.topicPerformance || {};
    const topics = Object.keys(topicPerformance)
        .filter(topic => topicPerformance[topic].total > 0)
        .sort((a, b) => {
            const perfA = topicPerformance[a];
            const perfB = topicPerformance[b];
            return (perfA.correct / perfA.total) - (perfB.correct / perfB.total);
        });
    
    // Generate recommendations for weakest topics
    const recommendations = topics.slice(0, 3).map((topic, index) => {
        const perf = topicPerformance[topic];
        const accuracy = Math.round((perf.correct / perf.total) * 100);
        
        return `
            <div class="study-focus-item">
                <strong>${topic}</strong>
                <div>Accuracy: ${accuracy}% (${perf.correct}/${perf.total})</div>
                <div class="mt-2">Recommended Action: 
                    <ul class="ml-4 mt-1" style="list-style-type: disc;">
                        <li>Review foundational concepts for ${topic}</li>
                        <li>Practice ${topic} questions for 30 minutes</li>
                        <li>Focus on ${topic} for your next study session</li>
                    </ul>
                </div>
            </div>
        `;
    });
    
    // Add recommendations
    container.innerHTML = recommendations.join('');
}

// ======================
// REVIEW SCREEN
// ======================
function showReviewScreen(sectionName) {
    const questions = localStorage.getItem(`examQuestions_${sectionName}`);
    if (!questions) {
        alert("Exam questions not found for review.");
        return;
    }
    
    appState.examQuestions = JSON.parse(questions);
    appState.reviewingSection = sectionName;
    appState.answers[sectionName] = appState.answers[sectionName] || new Array(appState.examQuestions.length).fill(null);
    const answers = appState.answers[sectionName];
    const section = sectionName === 'CUSTOM' 
        ? { title: 'Custom Exam' } 
        : SECTIONS[sectionName];
    
    // Update screen elements
    document.getElementById('review-section-title').textContent = section.title;
    document.getElementById('review-progress').textContent = `Reviewing all ${appState.examQuestions.length} questions`;
    
    // Set up filters
    const filterSelect = document.getElementById('review-filter');
    filterSelect.value = 'all';
    filterSelect.onchange = applyReviewFilters;
    
    const difficultySelect = document.getElementById('review-difficulty');
    difficultySelect.value = 'all';
    difficultySelect.onchange = applyReviewFilters;
    
    const searchInput = document.getElementById('review-search');
    searchInput.value = '';
    searchInput.oninput = applyReviewFilters;
    
    const container = document.getElementById('review-questions-container');
    container.innerHTML = '';
    
    // Render questions
    renderReviewQuestions();
    
    // Set up button actions
    document.getElementById('btn-review-back').onclick = () => showScreen('main-menu');
    
    // Render answer pattern analysis
    renderAnswerPatternAnalysis(sectionName);
    
    // Show the screen
    showScreen('review');
}

function renderReviewQuestions() {
    const sectionName = appState.reviewingSection;
    const answers = appState.answers[sectionName];
    const container = document.getElementById('review-questions-container');
    container.innerHTML = '';
    
    const filter = document.getElementById('review-filter').value;
    const difficulty = document.getElementById('review-difficulty').value;
    const searchTerm = document.getElementById('review-search').value.toLowerCase();
    
    appState.examQuestions.forEach((question, index) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === question.correct_answer;
        const isAnswered = userAnswer !== null;
        const flagged = appState.flaggedQuestions[sectionName]?.[index] || false;
        const notes = appState.questionNotes[sectionName]?.[index] || '';
        const timeSpent = appState.questionTimes[sectionName]?.[index] || 0;
        const difficultyLevel = appState.questionDifficulty[sectionName]?.[index] || 'medium';
        
        // Apply filters
        if (filter === 'correct' && !isCorrect) return;
        if (filter === 'wrong' && (isCorrect || !isAnswered)) return;
        if (filter === 'skipped' && isAnswered) return;
        if (filter === 'flagged' && !flagged) return;
        
        if (difficulty !== 'all' && difficultyLevel !== difficulty) return;
        
        // Apply search
        const searchMatch = question.stem.toLowerCase().includes(searchTerm) ||
                          question.choices.some(c => c.toLowerCase().includes(searchTerm));
        if (searchTerm && !searchMatch) return;
        
        let resultIndicator = '❓ Skipped';
        let indicatorColor = 'var(--warning-color)';
        
        if (isAnswered) {
            resultIndicator = isCorrect ? '✅ Correct' : '❌ Wrong';
            indicatorColor = isCorrect ? 'var(--success-color)' : 'var(--danger-color)';
        }
        
        let choicesHtml = '';
        question.choices.forEach((choice, choiceIndex) => {
            const letter = String.fromCharCode(65 + choiceIndex);
            const isChoiceCorrect = letter === question.correct_answer;
            const isChoiceUser = letter === userAnswer;
            let choiceClass = '';
            
            if (isChoiceCorrect) {
                choiceClass = 'bg-green-100 border-green-500';
            } else if (isChoiceUser) {
                choiceClass = 'bg-red-100 border-red-500';
            }
            
            choicesHtml += `
                <button type="button" class="choice-btn ${choiceClass}" disabled>
                    <span class="choice-letter">${letter}.</span>
                    <span>${choice.trim()}</span>
                </button>
            `;
        });
        
        const reviewCard = document.createElement('div');
        reviewCard.className = 'review-question-card';
        reviewCard.id = `review-question-${index}`;
        reviewCard.innerHTML = `
            <div class="question-header">
                <div>
                    <p class="question-number">Question ${index + 1}</p>
                    <span class="difficulty-badge difficulty-${difficultyLevel}">${difficultyLevel.charAt(0).toUpperCase()}</span>
                    ${question.group_id && question.stem.trim().startsWith('Situation') ? `<p class="question-group">Situation: ${question.group_id}</p>` : (question.group_id ? `<p class="question-group">Problem from Situation ${question.group_id}</p>` : '')}
                    <p class="result-indicator" style="font-weight: bold; margin-top: 0.25rem; color: ${indicatorColor}">${resultIndicator}</p>
                    <p class="time-spent">Time spent: ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s</p>
                </div>
                ${flagged ? `<span class="flagged-indicator"></span>` : ''}
            </div>
            <p class="question-stem whitespace-pre-wrap">${question.stem}</p>
            ${question.figure ? `<div class="question-image"><img src="${question.figure}" alt="Figure for question ${index + 1}" data-figure="${question.figure}"></div>` : ''}
            <div class="choices-container">${choicesHtml}</div>
            <div class="answer-comparison" style="margin-top: 1.5rem;">
                <p class="correct-answer">Correct Answer: ${question.correct_answer}</p>
                ${isAnswered ? `<p class="user-answer">Your Answer: ${userAnswer}</p>` : ''}
            </div>
            ${question.explanation ? `<div class="explanation"><p class="explanation-title">Explanation:</p><p class="whitespace-pre-wrap">${question.explanation}</p></div>` : ''}
            ${notes ? `<div class="note-container">
                <div class="note-header">
                    <span>Notes</span>
                </div>
                <p>${notes}</p>
            </div>` : ''}
        `;
        container.appendChild(reviewCard);
    });
    
    // Add image zoom functionality
    document.querySelectorAll('img[data-figure]').forEach(img => {
        img.addEventListener('click', () => {
            document.getElementById('zoomed-image').src = img.src;
            document.getElementById('image-modal').classList.remove('hidden');
        });
    });
}

function applyReviewFilters() {
    renderReviewQuestions();
}

function renderAnswerPatternAnalysis(sectionName) {
    const container = document.getElementById('answer-patterns');
    container.innerHTML = '';
    
    const result = appState.results[sectionName];
    if (!result || !result.answerPatterns) return;
    
    // Common mistakes
    const commonMistakes = result.answerPatterns.commonMistakes;
    if (commonMistakes.length > 0) {
        const mistakesHtml = commonMistakes.map(mistake => `
            <div class="answer-pattern">
                <div class="pattern-title">Question ${mistake.question.id}</div>
                <div class="pattern-description">
                    <strong>You answered:</strong> ${mistake.userAnswer} 
                    <br>
                    <strong>Correct answer:</strong> ${mistake.correctAnswer}
                    <br>
                    <strong>Times repeated:</strong> ${mistake.count}
                </div>
            </div>
        `).join('');
        
        container.innerHTML += `
            <div class="col-span-2">
                <h3 class="font-bold mb-2">Common Mistakes</h3>
                ${mistakesHtml}
            </div>
        `;
    }
    
    // Streak analysis
    if (result.answerPatterns.streakAnalysis && result.answerPatterns.streakAnalysis.length > 0) {
        const streak = result.answerPatterns.streakAnalysis[0];
        container.innerHTML += `
            <div class="col-span-2">
                <h3 class="font-bold mb-2">Answer Streaks</h3>
                <div class="answer-pattern">
                    <div class="pattern-title">Performance Streaks</div>
                    <div class="pattern-description">
                        <strong>Longest correct streak:</strong> ${streak.maxCorrectStreak} questions
                        <br>
                        <strong>Longest incorrect streak:</strong> ${streak.maxWrongStreak} questions
                    </div>
                </div>
            </div>
        `;
    }
    
    // Time analysis
    if (result.answerPatterns.timeAnalysis) {
        container.innerHTML += `
            <div class="col-span-2">
                <h3 class="font-bold mb-2">Time Management</h3>
                <div class="answer-pattern">
                    <div class="pattern-title">Time Per Question</div>
                    <div class="pattern-description">
                        <strong>Easy questions:</strong> ${result.answerPatterns.timeAnalysis.timePerQuestion.easy.avg} seconds
                        <br>
                        <strong>Medium questions:</strong> ${result.answerPatterns.timeAnalysis.timePerQuestion.medium.avg} seconds
                        <br>
                        <strong>Hard questions:</strong> ${result.answerPatterns.timeAnalysis.timePerQuestion.hard.avg} seconds
                    </div>
                </div>
            </div>
        `;
    }
}

// ======================
// CONFIRMATION MODAL
// ======================
function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
    
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    const okBtn = document.getElementById('btn-confirm-ok');
    
    // Prevent duplicate event listeners
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    const handleCancel = () => {
        document.getElementById('confirm-modal').classList.add('hidden');
    };
    
    const handleConfirm = () => {
        onConfirm();
        handleCancel();
    };
    
    newCancelBtn.addEventListener('click', handleCancel);
    newOkBtn.addEventListener('click', handleConfirm);
}

// ======================
// SETTINGS SCREEN
// ======================
function renderSettingsScreen() {
    // Apply current settings
    document.querySelectorAll('.theme-switcher button').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.id === `theme-${appState.settings.theme}`) {
            btn.classList.add('selected');
        }
    });
    
    document.querySelectorAll('.font-switcher button').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.id === `font-${appState.settings.fontSize}`) {
            btn.classList.add('selected');
        }
    });
    
    document.querySelectorAll('.nav-mode-switcher button').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.id === `nav-${appState.settings.navigationMode}`) {
            btn.classList.add('selected');
        }
    });
    
    // Auto-save status
    const autoSaveStatus = document.getElementById('auto-save-status');
    autoSaveStatus.textContent = appState.settings.autoSave ? '✅' : '❌';
    
    // Show timer status
    const showTimerStatus = document.getElementById('show-timer-status');
    showTimerStatus.textContent = appState.settings.showTimer ? '✅' : '❌';
    
    // Show progress status
    const showProgressStatus = document.getElementById('show-progress-status');
    showProgressStatus.textContent = appState.settings.showProgress ? '✅' : '❌';
    
    // Randomize status
    const randomizeStatus = document.getElementById('randomize-status');
    randomizeStatus.textContent = appState.settings.randomizeQuestions ? '✅' : '❌';
    
    // Show difficulty status
    const showDifficultyStatus = document.getElementById('show-difficulty-status');
    showDifficultyStatus.textContent = appState.settings.showDifficulty ? '✅' : '❌';
    
    // Theme switcher
    document.getElementById('theme-light').addEventListener('click', () => {
        appState.settings.theme = 'light';
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
        document.body.classList.add('light');
        saveState();
        renderSettingsScreen();
    });
    
    document.getElementById('theme-dark').addEventListener('click', () => {
        appState.settings.theme = 'dark';
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        document.body.classList.remove('light');
        saveState();
        renderSettingsScreen();
    });
    
    // Font size
    document.getElementById('font-small').addEventListener('click', () => {
        appState.settings.fontSize = 'small';
        saveState();
        renderSettingsScreen();
    });
    
    document.getElementById('font-medium').addEventListener('click', () => {
        appState.settings.fontSize = 'medium';
        saveState();
        renderSettingsScreen();
    });
    
    document.getElementById('font-large').addEventListener('click', () => {
        appState.settings.fontSize = 'large';
        saveState();
        renderSettingsScreen();
    });
    
    // Navigation mode
    document.getElementById('nav-scroll').addEventListener('click', () => {
        appState.settings.navigationMode = 'scroll';
        saveState();
        renderSettingsScreen();
    });
    
    document.getElementById('nav-step').addEventListener('click', () => {
        appState.settings.navigationMode = 'step';
        saveState();
        renderSettingsScreen();
    });
    
    // Auto-save toggle
    document.getElementById('btn-auto-save').addEventListener('click', () => {
        appState.settings.autoSave = !appState.settings.autoSave;
        saveState();
        renderSettingsScreen();
    });
    
    // Show timer toggle
    document.getElementById('btn-show-timer').addEventListener('click', () => {
        appState.settings.showTimer = !appState.settings.showTimer;
        saveState();
        renderSettingsScreen();
    });
    
    // Show progress toggle
    document.getElementById('btn-show-progress').addEventListener('click', () => {
        appState.settings.showProgress = !appState.settings.showProgress;
        saveState();
        renderSettingsScreen();
    });
    
    // Randomize questions toggle
    document.getElementById('btn-randomize-questions').addEventListener('click', () => {
        appState.settings.randomizeQuestions = !appState.settings.randomizeQuestions;
        saveState();
        renderSettingsScreen();
    });
    
    // Show difficulty toggle
    document.getElementById('btn-show-difficulty').addEventListener('click', () => {
        appState.settings.showDifficulty = !appState.settings.showDifficulty;
        saveState();
        renderSettingsScreen();
    });
    
    // Back button
    document.getElementById('btn-settings-back').addEventListener('click', () => showScreen('main-menu'));
}

// ======================
// PDF GENERATION
// ======================
function generateOfflinePDF() {
    // Create a visual PDF container
    const pdfContainer = document.getElementById('pdf-container');
    pdfContainer.innerHTML = '';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'printable-header';
    header.innerHTML = `
        <h2 class="printable-title">Civil Engineering Exam Simulator</h2>
        <p class="printable-subtitle">Printable version for offline study</p>
        <p class="text-muted">This document contains all exam questions with figures and explanations for offline study</p>
    `;
    pdfContainer.appendChild(header);
    
    // Add sections
    Object.values(SECTIONS).forEach((section, sectionIndex) => {
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'printable-section';
        sectionContainer.innerHTML = `<h3 class="printable-title">Section ${sectionIndex + 1}: ${section.title}</h3>`;
        
        const questions = getQuestionsForSection(section.name);
        questions.forEach((question, index) => {
            const questionContainer = document.createElement('div');
            questionContainer.className = 'printable-question';
            questionContainer.innerHTML = `
                <h3>Question ${index + 1}</h3>
                <div class="printable-stem">${question.stem}</div>
            `;
            
            // Add figure if exists
            if (question.figure) {
                const figureContainer = document.createElement('div');
                figureContainer.className = 'printable-figure';
                figureContainer.innerHTML = `
                    <img src="${question.figure}" alt="Figure for question ${index + 1}">
                    <p>Figure ${index + 1}: ${question.figure_caption || ''}</p>
                `;
                questionContainer.appendChild(figureContainer);
            }
            
            // Add choices
            const choicesContainer = document.createElement('div');
            choicesContainer.className = 'printable-choices';
            choicesContainer.innerHTML = '<p>Choices:</p>';
            
            question.choices.forEach((choice, choiceIndex) => {
                const letter = String.fromCharCode(65 + choiceIndex);
                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'printable-choice';
                choiceDiv.innerHTML = `<span class="choice-letter">${letter}.</span> ${choice.trim()}`;
                choicesContainer.appendChild(choiceDiv);
            });
            
            questionContainer.appendChild(choicesContainer);
            
            // Add explanation if exists
            if (question.explanation) {
                const explanationContainer = document.createElement('div');
                explanationContainer.className = 'printable-explanation';
                explanationContainer.innerHTML = `
                    <h4>Explanation:</h4>
                    <p>${question.explanation}</p>
                `;
                questionContainer.appendChild(explanationContainer);
            }
            
            sectionContainer.appendChild(questionContainer);
        });
        
        pdfContainer.appendChild(sectionContainer);
    });
    
    // Add footer
    const footer = document.createElement('div');
    footer.className = 'printable-footer';
    footer.innerHTML = `
        <p>© ${new Date().getFullYear()} Civil Engineering Exam Simulator. All rights reserved.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p class="text-muted">This document is for personal study purposes only. Do not distribute.</p>
    `;
    pdfContainer.appendChild(footer);
    
    // Show the PDF container for print preview
    pdfContainer.style.display = 'block';
    
    // Use the browser's native print dialog
    window.print();
    
    // Hide the container again after printing
    setTimeout(() => {
        pdfContainer.style.display = 'none';
    }, 1000);
}

// ======================
// HTML DECODING UTILITY
// ======================
function decodeHtmlEntities(text) {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = text;
    return tempElement.textContent || tempElement.innerText || '';
}

// ======================
// OTHER UTILITIES
// ======================
function getFallbackQuestions() {
    return [
        {
            id: 1,
            section: "AMSTHEC",
            topic: "Trigonometry",
            difficulty: "medium",
            solution: {
                step1: "Identify the triangle formed by the surveyor, the top of the building, and the base of the building.",
                step2: "Use the tangent function: tan(θ) = opposite/adjacent",
                step3: "tan(30°) = height / 50, so height = 50 * tan(30°)",
                step4: "Calculate: 50 * (1/√3) = 28.87 meters",
                proTip: "Remember that tan(30°) = 1/√3 ≈ 0.577"
            },
            stem: "A surveyor wants to measure the height of a building using a theodolite. If the angle of elevation to the top of the building is 30° and the distance from the theodolite to the building is 50 meters, what is the height of the building?",
            choices: [
                "25 meters",
                "28.87 meters",
                "43.30 meters",
                "50 meters"
            ],
            correct_answer: "B",
            explanation: "Using the tangent function: tan(30°) = height / 50. Height = 50 * tan(30°) = 50 * (1/√3) ≈ 28.87 meters."
        },
        {
            id: 2,
            section: "AMSTHEC",
            topic: "Calculus",
            difficulty: "hard",
            solution: {
                step1: "Identify the function as a polynomial: f(x) = 3x² + 5x - 2",
                step2: "Apply the power rule: d/dx(x^n) = nx^(n-1)",
                step3: "Differentiate each term: d/dx(3x²) = 6x, d/dx(5x) = 5, d/dx(-2) = 0",
                step4: "Combine results: f'(x) = 6x + 5",
                proTip: "Remember that the derivative of a constant is always 0"
            },
            stem: "What is the derivative of f(x) = 3x² + 5x - 2?",
            choices: [
                "6x + 5",
                "3x + 5",
                "6x² + 5",
                "x² + 5x"
            ],
            correct_answer: "A",
            explanation: "The derivative of 3x² is 6x, the derivative of 5x is 5, and the derivative of a constant (-2) is 0. So f'(x) = 6x + 5."
        },
        {
            id: 3,
            section: "HPGE",
            topic: "Soil Mechanics",
            difficulty: "medium",
            solution: {
                step1: "Understand the relationship between void ratio (e) and porosity (n)",
                step2: "Use the formula: n = e / (1 + e)",
                step3: "Substitute e = 0.6 into the formula",
                step4: "Calculate: n = 0.6 / (1 + 0.6) = 0.6 / 1.6 = 0.375",
                proTip: "Remember that porosity is always less than the void ratio"
            },
            stem: "In a soil sample, the void ratio is 0.6 and the specific gravity of soil solids is 2.7. What is the porosity of the soil?",
            choices: [
                "0.375",
                "0.6",
                "0.625",
                "0.75"
            ],
            correct_answer: "A",
            explanation: "Porosity (n) = e / (1 + e), where e is the void ratio. n = 0.6 / (1 + 0.6) = 0.6 / 1.6 = 0.375."
        },
        {
            id: 4,
            section: "PSAD",
            topic: "Concrete Design",
            difficulty: "hard",
            solution: {
                step1: "Review building code requirements for minimum reinforcement",
                step2: "Understand that minimum reinforcement is needed to ensure ductile behavior",
                step3: "Recall the standard minimum reinforcement ratio for simply supported beams",
                step4: "The minimum reinforcement ratio is typically 0.003 (0.3%)",
                proTip: "This minimum ensures the beam fails in tension rather than brittle compression"
            },
            stem: "What is the minimum reinforcement ratio for a simply supported reinforced concrete beam?",
            choices: [
                "0.001",
                "0.002",
                "0.003",
                "0.005"
            ],
            correct_answer: "C",
            explanation: "The minimum reinforcement ratio for a simply supported reinforced concrete beam is typically 0.003 (0.3%) to ensure ductile behavior."
        }
    ];
}

function getSampleQuestions(sectionName) {
    return getFallbackQuestions().filter(q => q.section === sectionName);
}

// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', async () => {
    // Apply saved theme
    if (appState.settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        document.body.classList.remove('light');
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.add('light');
        document.body.classList.remove('dark');
    }
    
    // Apply font size
    document.body.classList.add(`font-${appState.settings.fontSize}`);
    
    // Apply navigation mode
    document.body.classList.add(`nav-${appState.settings.navigationMode}`);
    
    // Show loading screen
    showScreen('loading');
    
    // Load question bank
    try {
        await loadQuestionBank();
        setTimeout(() => showScreen('main-menu'), 1000);
    } catch (error) {
        console.error('Failed to initialize app:', error);
        setTimeout(() => showScreen('main-menu'), 1000);
    }
    
    // Close modal on image click
    const closeImageModal = document.getElementById('close-image-modal');
    if (closeImageModal) {
        closeImageModal.onclick = () => {
            document.getElementById('image-modal').classList.add('hidden');
        };
    }
    
    // Prevent default form submission
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', e => e.preventDefault());
    });
});
