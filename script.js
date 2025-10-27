// ======================
// CONFIGURATION
// ======================
const SECTIONS = {
    AMSTHEC: {
        name: "AMSTHEC",
        title: "Mathematics, Surveying & Transportation Engineering",
        total: 75,
        time: 5 * 60 * 60 // 5 hours in seconds
    },
    HPGE: {
        name: "HPGE",
        title: "Hydraulics & Geotechnical Engineering",
        total: 50,
        time: 4 * 60 * 60 // 4 hours in seconds
    },
    PSAD: {
        name: "PSAD",
        title: "Structural Design & Construction",
        total: 75,
        time: 5 * 60 * 60 // 5 hours in seconds
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
    settings: JSON.parse(localStorage.getItem('examSettings')) ||
    {
        theme: 'light',
        fontSize: 'medium',
        autoSave: true,
        navigationMode: 'scroll'
    },
    answers: JSON.parse(localStorage.getItem('examAnswers')) ||
    {},
    results: JSON.parse(localStorage.getItem('examResults')) || {},
    bookmarks: JSON.parse(localStorage.getItem('examBookmarks')) ||
    [],
    currentSection: null,
    timeLeft: 0,
    timerInterval: null,
    examQuestions: [],
    reviewingSection: null,
    fullQuestionBank: [],
    isPaused: false, // 🔹 Added for pause/resume
    firstWrongIndex: null // 🔹 Added for scroll to first wrong
};

// ======================
// QUESTION BANK MANAGEMENT
// ======================
async function loadQuestionBank() {
    try {
        // NOTE: The question_bank.json file is not provided, so this will likely fail
        // and fall back to the sample questions.
        const response = await fetch('question_bank.json');
        if (!response.ok) {
            throw new Error(`Failed to load question bank: ${response.status}`);
        }
        const questionBank = await response.json();
        console.log(`Loaded ${questionBank.length} questions from question bank`);
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
    const sectionQuestions = appState.fullQuestionBank.filter(q => q.section === sectionName);
    const processedQuestions = processQuestionsWithGroups(sectionQuestions);
    const requiredTotal = SECTION_REQUIREMENTS[sectionName].total;
    return processedQuestions.slice(0, requiredTotal);
}

function processQuestionsWithGroups(questions) {
    const groupMap = {};
    questions.forEach(question => {
        const gid = question.group_id;
        if (gid) {
            if (!groupMap[gid]) groupMap[gid] = [];
            groupMap[gid].push(question);
        } else {
            const tempId = `__single_${Math.random().toString(36).substring(2, 10)}`;
            groupMap[tempId] = [question];
        }
    });

    const validGroups = [];
    const standaloneQuestions = [];

    Object.entries(groupMap).forEach(([gid, group]) => {
        if (group.length === 3 && gid !== '__single_undefined' && !gid.startsWith('__single_')) {
            const hasSituationStem = group.some(q => q.stem.trim().startsWith('Situation'));
            if (hasSituationStem) {
                const sortedGroup = [...group].sort((a, b) => 
                    a.stem.trim().startsWith('Situation') ? -1 : 
                    b.stem.trim().startsWith('Situation') ? 1 : 0
                );
                validGroups.push(sortedGroup);
            } else {
                standaloneQuestions.push(...group);
            }
        } else {
            standaloneQuestions.push(...group);
        }
    });

    const shuffledGroups = shuffleArray(validGroups);
    const shuffledSingles = shuffleArray(standaloneQuestions);

    let result = [];
    let singleIndex = 0;

    if (shuffledGroups.length > 0) {
        shuffledGroups.forEach((group, i) => {
            result.push(...group);
            const toAdd = Math.min(2, shuffledSingles.length - singleIndex);
            for (let j = 0; j < toAdd; j++) {
                result.push(shuffledSingles[singleIndex++]);
            }
        });
        while (singleIndex < shuffledSingles.length) {
            result.push(shuffledSingles[singleIndex++]);
        }
    } else {
        result = shuffledSingles;
    }

    // Check last N questions to ensure no situation question is dangling at the end
    const checkLastN = 5;
    const tail = result.slice(-checkLastN);
    const badIndex = tail.findIndex(q => q.stem.trim().startsWith('Situation'));

    if (badIndex !== -1) {
        const badQ = result[result.length - checkLastN + badIndex];
        const badGroupId = badQ.group_id;
        if (badGroupId) {
            const fullGroup = result.filter(q => q.group_id === badGroupId);
            const remaining = result.filter(q => q.group_id !== badGroupId);
            const insertPos = Math.max(3, Math.floor(remaining.length / 2));
            remaining.splice(insertPos, 0, ...fullGroup);
            result = remaining;
        }
    }

    // Post-processing to enforce 3-question groups with situation stem
    const groupSizeMap = {};
    result.forEach(q => {
        const gid = q.group_id;
        if (gid) {
            groupSizeMap[gid] = (groupSizeMap[gid] || 0) + 1;
        }
    });

    result.forEach(q => {
        const gid = q.group_id;
        const groupSize = groupSizeMap[gid];
        const isSituation = q.stem.trim().startsWith('Situation') || result.some(g => g.group_id === gid && g.stem.trim().startsWith('Situation'));
        if (groupSize !== 3 || !isSituation) {
            q.group_id = null;
        }
    });

    return result;
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
    localStorage.setItem('examBookmarks', JSON.stringify(appState.bookmarks));
    localStorage.setItem('examSettings', JSON.stringify(appState.settings));
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
        } else if (screenId === 'bookmarks') {
            renderBookmarksScreen();
        } else if (screenId === 'analytics') {
            renderAnalyticsScreen();
        }
    }
}

// ======================
// BOOKMARKS
// ======================
function toggleBookmark(section, questionIndex) {
    const bookmarkId = `${section}-${questionIndex}`;
    const existingIndex = appState.bookmarks.findIndex(b => b.id === bookmarkId);
    if (existingIndex > -1) {
        appState.bookmarks.splice(existingIndex, 1);
    } else {
        appState.bookmarks.push({
            id: bookmarkId,
            section: section,
            questionIndex: questionIndex,
            timestamp: new Date().toISOString()
        });
    }
    saveState();
    return existingIndex === -1;
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

    // Only set time if not currently paused (meaning a fresh start or resume from a non-paused state)
    if (!appState.isPaused) {
        appState.timeLeft = SECTIONS[sectionName].time;
    }

    if (document.getElementById('exam-timer')) {
        document.getElementById('exam-timer').textContent = formatTime(appState.timeLeft);
    }

    // Start timer only if not paused
    if (!appState.isPaused) {
        startTimer();
    }
}

function startTimer() {
    clearInterval(appState.timerInterval);
    if (appState.isPaused) return; // Do not start timer if paused
    appState.timerInterval = setInterval(() => {
        appState.timeLeft--;
        if (document.getElementById('exam-timer')) {
            document.getElementById('exam-timer').textContent = formatTime(appState.timeLeft);
        }
        if (appState.timeLeft <= 0) {
            clearInterval(appState.timerInterval);
            submitExam();
        }
    }, 1000);
}

// ======================
// RESET
// ======================
function resetExam() {
    if (!confirm('Are you sure you want to reset all exam data? This cannot be undone.')) return;
    clearInterval(appState.timerInterval);
    appState.answers = {};
    appState.results = {};
    appState.bookmarks = [];
    appState.timeLeft = 0;
    appState.currentSection = null;
    appState.isPaused = false;
    appState.firstWrongIndex = null;
    localStorage.removeItem('examAnswers');
    localStorage.removeItem('examResults');
    localStorage.removeItem('examBookmarks');
    Object.keys(SECTIONS).forEach(sectionName => {
        localStorage.removeItem(`examQuestions_${sectionName}`);
    });
    showScreen('main-menu');
}

// ======================
// MAIN MENU – FIXED FOR PAUSE/RESUME
// ======================
function renderMainMenu() {
    const completedCount = Object.keys(appState.results).length;
    document.getElementById('progress-text').textContent = `${completedCount}/3 sections completed`;
    const grid = document.getElementById('section-grid');
    grid.innerHTML = '';
    
    Object.values(SECTIONS).forEach((section, idx) => {
        const isCompleted = appState.results[section.name] !== undefined;
        // Check if the current section is this one AND it is paused
        const isPaused = appState.isPaused && appState.currentSection === section.name;
        const score = isCompleted ? appState.results[section.name].score_pct : null;
        const card = document.createElement('div');
        card.className = 'section-card';

        let buttonText = isCompleted ? 'Review Section' : (isPaused ? 'Continue Section' : 'Start Section');
        let buttonClass = isCompleted ? 'btn-secondary' : 'btn-primary';

        card.innerHTML = `
            <div class="section-card-header">
                <h2 class="section-card-title">
                    <span>${['📐','🗺️','📊'][idx % 3]}</span>
                    ${section.name}
                </h2>
                ${isCompleted ? `<span class="section-card-score">${score.toFixed(1)}%</span>` : ''}
            </div>
            <p class="section-card-description">${section.title}</p>
            <button class="btn ${buttonClass}" data-action="${isCompleted ? 'review' : (isPaused ? 'continue' : 'start')}" data-section="${section.name}">
                ${buttonText}
            </button>
            ${isCompleted ? `
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${score}%"></div>
                </div>
            ` : ''}
        `;

        // 🔹 Show remaining time if paused
        if (isPaused) {
            const timeDisplay = formatTime(appState.timeLeft);
            const timerEl = document.createElement('p');
            timerEl.className = 'paused-timer';
            timerEl.textContent = `⏸ Time left: ${timeDisplay}`;
            timerEl.style.fontSize = '0.875rem';
            timerEl.style.color = 'var(--text-muted-light)';
            // Add dark mode support for the paused timer text
            if (document.documentElement.classList.contains('dark')) {
                timerEl.style.color = 'var(--text-muted-dark)';
            }
            card.appendChild(timerEl);
        }

        grid.appendChild(card);
    });

    // Start or Continue Section
    document.querySelectorAll('[data-action="start"], [data-action="continue"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionName = e.target.dataset.section;
            appState.currentSection = sectionName;
            showScreen('instructions');
        });
    });

    // Review Section
    document.querySelectorAll('[data-action="review"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sectionName = e.target.dataset.section;
            showReviewScreen(sectionName);
        });
    });

    document.getElementById('btn-full-mock').addEventListener('click', startFullMockExam);
    document.getElementById('btn-settings').addEventListener('click', () => showScreen('settings'));
    document.getElementById('btn-bookmarks').addEventListener('click', () => showScreen('bookmarks'));
    document.getElementById('btn-analytics').addEventListener('click', () => showScreen('analytics'));
    document.getElementById('btn-download-pdf').addEventListener('click', generateOfflinePDF);
    document.getElementById('btn-reset').addEventListener('click', resetExam);
}

// ======================
// INSTRUCTIONS SCREEN – FIXED
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

    document.getElementById('btn-instructions-back').onclick = () => showScreen('main-menu');
    document.getElementById('btn-start-exam').onclick = () => {
        if (!appState.isPaused) {
            // Load fresh questions if not continuing a paused exam
            loadQuestionsForSection(appState.currentSection);
        }
        appState.isPaused = false;
        showScreen('exam');
        // Restart timer just in case it was cleared, but only if not paused (which is handled in loadQuestionsForSection but safe to call again)
        startTimer();
    };
}

// ======================
// EXAM SCREEN – FIXED
// ======================
function renderExam() {
    const section = SECTIONS[appState.currentSection];
    const totalQuestions = appState.examQuestions.length;
    let currentQuestionIndex = 0; // Default for step mode
    
    document.getElementById('exam-section-title').textContent = section.title;
    document.getElementById('exam-progress').textContent = `Question 1 of ${totalQuestions}`;
    const container = document.getElementById('exam-questions-container');
    container.innerHTML = '';

    // Apply font size and navigation mode classes
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize} nav-${appState.settings.navigationMode}`;

    appState.examQuestions.forEach((question, index) => {
        const userAnswer = appState.answers[appState.currentSection][index];
        const isBookmarked = appState.bookmarks.some(b => 
            b.section === appState.currentSection && b.questionIndex === index
        );

        const questionCard = document.createElement('div');
        questionCard.className = 'question-card';
        questionCard.id = `question-${index}`;
        
        // Handle step navigation mode: show only the first question initially
        if (appState.settings.navigationMode === 'step' && index === 0) {
            questionCard.classList.add('active-question');
            currentQuestionIndex = 0;
            document.getElementById('exam-progress').textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
        }
        
        const bookmarkIcon = isBookmarked ? '🔖' : '📖';
        const bookmarkClass = isBookmarked ? 'btn-primary' : 'btn-secondary';

        questionCard.innerHTML = `
            <div class="question-header">
                <div>
                    <p class="question-number">Question ${index + 1}</p>
                    ${question.group_id && question.stem.trim().startsWith('Situation') ? `<p class="question-group">Situation: ${question.group_id}</p>` : (question.group_id ? `<p class="question-group">Problem from Situation ${question.group_id}</p>` : '')}
                </div>
                <button class="btn ${bookmarkClass} btn-sm" data-bookmark="${index}">
                    ${bookmarkIcon}
                </button>
            </div>
            <p class="question-stem whitespace-pre-wrap">${question.stem}</p>
            ${question.figure ?
                `
                <div class="question-image">
                    <img src="${question.figure}" alt="Figure for question ${index + 1}" data-figure="${question.figure}">
                </div>
                ` : ''}
            <div class="choices-container">
                ${question.choices.map((choice, choiceIndex) => {
                    const letter = String.fromCharCode(65 + choiceIndex);
                    const isSelected = userAnswer === letter;
                    return `
                        <button class="choice-btn ${isSelected ? 'selected' : ''}" data-question="${index}" data-choice="${letter}">
                            <span class="choice-letter">${letter}.</span>
                            <span>${choice.trim()}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;
        container.appendChild(questionCard);
    });

    // Event listeners for bookmarking
    document.querySelectorAll('[data-bookmark]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const index = parseInt(button.dataset.bookmark);
            const isNowBookmarked = toggleBookmark(appState.currentSection, index);
            button.className = `btn ${isNowBookmarked ? 'btn-primary' : 'btn-secondary'} btn-sm`;
            button.innerHTML = isNowBookmarked ? '🔖' : '📖';
        });
    });

    // Event listeners for answering a question
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.target.closest('.choice-btn');
            const questionIndex = parseInt(btnEl.dataset.question);
            const choice = btnEl.dataset.choice;
            
            selectAnswer(questionIndex, choice);

            // Update UI for choice selection
            const questionCard = document.getElementById(`question-${questionIndex}`);
            questionCard.querySelectorAll('.choice-btn').forEach(choiceBtn => {
                choiceBtn.classList.remove('selected');
            });
            btnEl.classList.add('selected');

            // Auto-scroll to next question in scroll mode
            if (appState.settings.navigationMode === 'scroll') {
                const nextIndex = questionIndex + 1;
                const nextEl = document.getElementById(`question-${nextIndex}`);
                if (nextEl) {
                    const header = document.querySelector('.exam-header');
                    const headerHeight = header ? header.offsetHeight : 60;
                    const elementPosition = nextEl.getBoundingClientRect().top + window.scrollY;
                    const offsetPosition = elementPosition - headerHeight - 10;
                    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }
            } else if (appState.settings.navigationMode === 'step') {
                // In step mode, clicking an answer automatically moves to the next question
                setTimeout(() => navigateStep(1), 300); // Small delay for visual feedback
            }
        });
    });

    // Event listener for image zoom modal
    document.querySelectorAll('img[data-figure]').forEach(img => {
        img.addEventListener('click', () => {
            document.getElementById('zoomed-image').src = img.src;
            document.getElementById('image-modal').classList.remove('hidden');
        });
    });

    // Exam controls
    document.getElementById('btn-pause-resume').onclick = () => {
        clearInterval(appState.timerInterval);
        appState.isPaused = true;
        saveState();
        showScreen('main-menu');
    };

    document.getElementById('btn-submit-exam').onclick = () => {
        showConfirmModal(
            "Confirm Submission",
            "Are you sure you want to submit this exam section? You won't be able to change your answers after submission.",
            submitExam
        );
    };

    // Footer buttons
    document.getElementById('btn-jump-to-first').onclick = jumpToFirstUnanswered;

    // Navigation for Step Mode
    document.getElementById('btn-nav-next').onclick = () => {
        navigateStep(1);
    };

    function navigateStep(direction) {
        const activeCard = document.querySelector('.question-card.active-question');
        if (!activeCard) return;

        let currentIndex = parseInt(activeCard.id.split('-')[1]);
        let nextIndex = currentIndex + direction;

        if (nextIndex >= 0 && nextIndex < totalQuestions) {
            activeCard.classList.remove('active-question');
            const nextCard = document.getElementById(`question-${nextIndex}`);
            if (nextCard) {
                nextCard.classList.add('active-question');
                document.getElementById('exam-progress').textContent = `Question ${nextIndex + 1} of ${totalQuestions}`;
                // Scroll to the top of the question to account for small screens
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else if (nextIndex >= totalQuestions) {
            // Reached the end, prompt to submit
            showConfirmModal(
                "Section Completed",
                "You have reached the end of the section. Do you want to submit your exam now?",
                submitExam
            );
        }
    }
}

function selectAnswer(questionIndex, choice) {
    if (appState.currentSection === null) return;
    appState.answers[appState.currentSection][questionIndex] = choice;
    saveState();
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
// SUBMIT EXAM – FIXED
// ======================
function submitExam() {
    clearInterval(appState.timerInterval);
    const sectionName = appState.currentSection;
    const questions = appState.examQuestions;
    const answers = appState.answers[sectionName];

    let correctCount = 0;
    const wrongAnswers = [];

    questions.forEach((question, index) => {
        const userAnswer = answers[index];
        if (userAnswer === question.correct_answer) {
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
                group_id: question.group_id
            });
        }
    });

    // 🔹 Track first wrong question index
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
        timestamp: new Date().toISOString()
    };
    appState.isPaused = false;
    saveState();
    showResultsScreen(sectionName);
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

    // Clean up previous listeners
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
// RESULTS SCREEN – FIXED
// ======================
function showResultsScreen(sectionName) {
    const result = appState.results[sectionName];
    const passed = result.score_pct >= 70;
    const screen = document.getElementById('screen-results');

    let wrongAnswersHTML = '';
    
    if (result.wrong.length > 0) {
        result.wrong.forEach(wrong => {
            let choicesHtml = '';
            wrong.choices.forEach((choice, index) => {
                const letter = String.fromCharCode(65 + index);
                const isCorrect = letter === wrong.correct_answer;
                const isUser = letter === wrong.user_answer && !isCorrect;

                let choiceClass = 'choice-btn';
                if (isCorrect) choiceClass += ' bg-green-100 border-green-500';
                else if (isUser) choiceClass += ' bg-red-100 border-red-500';

                // Replicate logic for review card to show correct/wrong user answers
                const reviewChoiceCardClass = isCorrect ? 'bg-green-100' : (isUser ? 'bg-red-100' : '');
                const reviewChoiceCardBorder = isCorrect ? 'border-green-500' : (isUser ? 'border-red-500' : 'border-gray-200');

                choicesHtml += `
                    <div class="choice-btn ${reviewChoiceCardClass} ${reviewChoiceCardBorder}">
                        <span class="choice-letter">${letter}.</span>
                        <span>${choice}</span>
                    </div>
                `;
            });

            wrongAnswersHTML += `
                <div class="wrong-answer-card">
                    <div class="question-header">
                        <p class="question-number">Question ${wrong.number}</p>
                        ${wrong.group_id ? `<p class="question-group">Problem from Situation ${wrong.group_id}</p>` : ''}
                    </div>
                    <p class="question-stem whitespace-pre-wrap">${wrong.stem}</p>
                    ${wrong.figure ? `
                        <div class="question-image">
                            <img src="${wrong.figure}" alt="Figure for question ${wrong.number}" data-figure="${wrong.figure}">
                        </div>
                    ` : ''}
                    <div class="choices-container">${choicesHtml}</div>
                    <div class="answer-comparison">
                        <p class="user-answer">Your Answer: ${wrong.user_answer || "Not Answered"}</p>
                        <p class="correct-answer">Correct Answer: ${wrong.correct_answer}</p>
                        ${wrong.explanation ?
                            `
                            <div class="explanation">
                                <p class="explanation-title">Explanation:</p>
                                <p class="whitespace-pre-wrap">${wrong.explanation}</p>
                            </div>
                            ` : ''}
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <div class="container results-container">
            <div class="results-card">
                <h1 class="section-title">${SECTIONS[sectionName].title} - Results</h1>
                <p class="score-message">${passed ? 'Congratulations! You Passed!' : 'Review Required. You Did Not Pass.'}</p>
                <div class="score ${passed ? 'pass' : 'fail'}">${result.score_pct.toFixed(1)}%</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span>Total Questions</span>
                        <div class="stat-value">${result.total}</div>
                    </div>
                    <div class="stat-item">
                        <span>Correct Answers</span>
                        <div class="stat-value text-green-500">${result.correct}</div>
                    </div>
                    <div class="stat-item">
                        <span>Wrong/Skipped</span>
                        <div class="stat-value text-red-500">${result.total - result.correct}</div>
                    </div>
                </div>
                <div class="action-buttons">
                    <button id="btn-results-main-menu" class="btn btn-secondary">Back to Main Menu</button>
                    <button id="btn-review-section" class="btn btn-primary">Review Full Section</button>
                </div>
            </div>

            ${result.wrong.length > 0 ? `
                <div class="wrong-answers-section">
                    <h2>Incorrect/Skipped Answers (${result.wrong.length})</h2>
                    <p class="text-center mb-4">You can use the 'Review Full Section' button to see all questions in order.</p>
                    <div id="wrong-answers-list">${wrongAnswersHTML}</div>
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('btn-results-main-menu').onclick = () => showScreen('main-menu');
    document.getElementById('btn-review-section').onclick = () => showReviewScreen(sectionName);
}

// ======================
// REVIEW SCREEN – FIXED
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
    const screen = document.getElementById('screen-review');
    
    // Apply font size and theme
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize}`;

    let reviewQuestionsHTML = '';
    
    appState.examQuestions.forEach((question, index) => {
        const userAnswer = answers[index];
        const isBookmarked = appState.bookmarks.some(b => 
            b.section === sectionName && b.questionIndex === index
        );
        const isCorrect = userAnswer === question.correct_answer;
        const isAnswered = userAnswer !== null;

        const resultIndicator = isAnswered 
            ? (isCorrect ? '✅ Correct' : '❌ Wrong') 
            : '❓ Skipped';

        const bookmarkIcon = isBookmarked ? '🔖' : '📖';
        const bookmarkClass = isBookmarked ? 'btn-primary' : 'btn-secondary';

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
                <button class="choice-btn ${choiceClass}" data-correct="${isChoiceCorrect}" data-user="${isChoiceUser}" disabled>
                    <span class="choice-letter">${letter}.</span>
                    <span>${choice.trim()}</span>
                </button>
            `;
        });

        reviewQuestionsHTML += `
            <div class="review-question-card" id="review-question-${index}">
                <div class="question-header">
                    <div>
                        <p class="question-number">Question ${index + 1}</p>
                        ${question.group_id && question.stem.trim().startsWith('Situation') ? `<p class="question-group">Situation: ${question.group_id}</p>` : (question.group_id ? `<p class="question-group">Problem from Situation ${question.group_id}</p>` : '')}
                        <p class="result-indicator" style="font-weight: bold; margin-top: 0.25rem; color: ${isCorrect ? 'var(--success-color)' : (isAnswered ? 'var(--danger-color)' : 'var(--warning-color)')}">${resultIndicator}</p>
                    </div>
                    <button class="btn ${bookmarkClass} btn-sm review-bookmark-btn" data-bookmark="${index}">
                        ${bookmarkIcon}
                    </button>
                </div>
                <p class="question-stem whitespace-pre-wrap">${question.stem}</p>
                ${question.figure ? `
                    <div class="question-image">
                        <img src="${question.figure}" alt="Figure for question ${index + 1}" data-figure="${question.figure}">
                    </div>
                ` : ''}
                <div class="choices-container">${choicesHtml}</div>
                <div class="answer-comparison" style="margin-top: 1.5rem;">
                    <p class="correct-answer">Correct Answer: ${question.correct_answer}</p>
                    ${isAnswered ? `<p class="user-answer">Your Answer: ${userAnswer}</p>` : ''}
                </div>
                ${question.explanation ? `
                    <div class="explanation">
                        <p class="explanation-title">Explanation:</p>
                        <p class="whitespace-pre-wrap">${question.explanation}</p>
                    </div>
                ` : ''}
            </div>
        `;
    });

    screen.innerHTML = `
        <div class="container review-container">
            <div class="review-header">
                <h1>Review: ${SECTIONS[sectionName].title}</h1>
            </div>
            <div id="review-questions-container" class="review-questions-container">
                ${reviewQuestionsHTML}
            </div>
            <div class="action-buttons mt-4">
                <button id="btn-review-back" class="btn btn-secondary">Back to Main Menu</button>
                <button id="btn-review-jump-wrong" class="btn btn-danger">Jump to First Wrong</button>
            </div>
        </div>
    `;

    // Re-attach bookmark listeners for the review screen
    document.querySelectorAll('.review-bookmark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const index = parseInt(button.dataset.bookmark);
            const isNowBookmarked = toggleBookmark(sectionName, index);
            button.className = `btn ${isNowBookmarked ? 'btn-primary' : 'btn-secondary'} btn-sm review-bookmark-btn`;
            button.innerHTML = isNowBookmarked ? '🔖' : '📖';
        });
    });

    // Re-attach image zoom listeners
    document.querySelectorAll('img[data-figure]').forEach(img => {
        img.addEventListener('click', () => {
            document.getElementById('zoomed-image').src = img.src;
            document.getElementById('image-modal').classList.remove('hidden');
        });
    });

    document.getElementById('btn-review-back').onclick = () => showScreen('main-menu');
    document.getElementById('btn-review-jump-wrong').onclick = () => {
        if (appState.firstWrongIndex !== null) {
            const targetEl = document.getElementById(`review-question-${appState.firstWrongIndex}`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            alert("Congratulations! You got everything correct in this section.");
        }
    };
    
    // Clear firstWrongIndex after entering review mode
    appState.firstWrongIndex = null;
    saveState();
}

// ======================
// BOOKMARKS SCREEN
// ======================
function renderBookmarksScreen() {
    const container = document.getElementById('bookmarks-list');
    const message = document.getElementById('bookmarks-message');
    container.innerHTML = '';
    
    // Apply font size and theme
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize}`;

    if (appState.bookmarks.length === 0) {
        message.textContent = "You have no bookmarked questions.";
    } else {
        message.textContent = "";
        
        // Sort bookmarks by timestamp descending (most recent first)
        const sortedBookmarks = [...appState.bookmarks].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        sortedBookmarks.forEach(bookmark => {
            // Find the question details - requires fetching the question bank first if not loaded
            const sectionQuestions = JSON.parse(localStorage.getItem(`examQuestions_${bookmark.section}`)) || getSampleQuestions(bookmark.section);
            const question = sectionQuestions[bookmark.questionIndex];
            
            const card = document.createElement('div');
            card.className = 'bookmark-card';
            card.innerHTML = `
                <div class="bookmark-info">
                    <p class="bookmark-section">Section: ${SECTIONS[bookmark.section].title} - Q.${bookmark.questionIndex + 1}</p>
                    <p class="bookmark-stem">${question.stem.substring(0, 100).trim()}...</p>
                </div>
                <div class="bookmark-actions flex gap-2">
                    <button class="btn btn-sm btn-primary btn-goto-bookmark" data-section="${bookmark.section}" data-index="${bookmark.questionIndex}">
                        Go to Question
                    </button>
                    <button class="btn btn-sm btn-secondary btn-remove-bookmark" data-section="${bookmark.section}" data-index="${bookmark.questionIndex}">
                        Unbookmark
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        // Event listeners for bookmark actions
        document.querySelectorAll('.btn-goto-bookmark').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sectionName = e.currentTarget.dataset.section;
                const index = parseInt(e.currentTarget.dataset.index);
                
                // Show review screen and jump to question
                showReviewScreen(sectionName);
                setTimeout(() => {
                    const targetEl = document.getElementById(`review-question-${index}`);
                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            });
        });

        document.querySelectorAll('.btn-remove-bookmark').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sectionName = e.currentTarget.dataset.section;
                const index = parseInt(e.currentTarget.dataset.index);
                
                // Remove the bookmark and re-render the list
                toggleBookmark(sectionName, index);
                renderBookmarksScreen();
            });
        });
    }
    
    document.getElementById('btn-bookmarks-back').onclick = () => showScreen('main-menu');
}

// ======================
// ANALYTICS SCREEN
// ======================
function renderAnalyticsScreen() {
    const analyticsContent = document.getElementById('analytics-content');
    const sectionList = document.getElementById('section-analytics-list');
    sectionList.innerHTML = '';
    
    // Apply font size and theme
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize}`;

    const completedSections = Object.keys(appState.results);
    if (completedSections.length === 0) {
        analyticsContent.innerHTML = '<p class="text-center">Complete an exam section to view analytics.</p>';
        document.getElementById('btn-analytics-back').onclick = () => showScreen('main-menu');
        return;
    }

    // Overall Calculation
    let overallCorrect = 0;
    let overallTotal = 0;
    
    const sectionNames = [];
    const sectionScores = [];

    completedSections.forEach(sectionName => {
        const result = appState.results[sectionName];
        overallCorrect += result.correct;
        overallTotal += result.total;
        
        sectionNames.push(sectionName);
        sectionScores.push(result.score_pct.toFixed(1));

        // Section Analytics Card
        const card = document.createElement('div');
        card.className = 'card analytics-section-card';
        card.innerHTML = `
            <h3>${SECTIONS[sectionName].title} (${sectionName})</h3>
            <p class="analytics-score" style="color: ${result.score_pct >= 70 ? 'var(--success-color)' : 'var(--danger-color)'}">${result.score_pct.toFixed(1)}%</p>
            <div class="analytics-stats-list">
                <div class="analytics-stat-item"><span>Correct:</span> <span>${result.correct} / ${result.total}</span></div>
                <div class="analytics-stat-item"><span>Weight:</span> <span>${(SECTION_WEIGHTS[sectionName] * 100).toFixed(0)}%</span></div>
                <div class="analytics-stat-item"><span>Timestamp:</span> <span>${new Date(result.timestamp).toLocaleDateString()}</span></div>
            </div>
        `;
        sectionList.appendChild(card);
    });

    const overallScore = (overallCorrect / overallTotal) * 100;
    const isOverallPassed = overallScore >= 70;

    // Update Overall Performance text
    document.getElementById('overall-score').innerHTML = `Weighted Average: <span style="font-weight: bold; color: ${isOverallPassed ? 'var(--success-color)' : 'var(--danger-color)'}">${overallScore.toFixed(2)}%</span>`;
    document.getElementById('overall-correct').textContent = `Total Correct: ${overallCorrect} / ${overallTotal}`;

    // Render Chart (using a mock object as Chart.js is not included in the bundle)
    const ctx = document.getElementById('overall-chart').getContext('2d');
    
    // Mock Chart Rendering - Replace with actual Chart.js logic if dependencies are available
    if (window.Chart) {
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sectionNames,
                datasets: [{
                    label: 'Score Percentage',
                    data: sectionScores,
                    backgroundColor: sectionScores.map(score => score >= 70 ? 'var(--success-color)' : 'var(--danger-color)'),
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Score (%)'
                        }
                    }
                }
            }
        });
    } else {
        // Fallback for missing Chart.js
        ctx.canvas.style.display = 'none';
        const chartFallback = document.createElement('p');
        chartFallback.textContent = 'Chart visualization requires Chart.js library.';
        analyticsContent.insertBefore(chartFallback, sectionList);
    }

    document.getElementById('btn-analytics-back').onclick = () => showScreen('main-menu');
}

// ======================
// SETTINGS SCREEN
// ======================
function renderSettingsScreen() {
    // Apply font size and theme
    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize}`;
    
    // Theme Switcher
    ['light', 'dark'].forEach(theme => {
        const btn = document.getElementById(`theme-${theme}`);
        btn.classList.toggle('selected', appState.settings.theme === theme);
        btn.onclick = () => {
            appState.settings.theme = theme;
            document.documentElement.classList.toggle('dark', theme === 'dark');
            document.body.classList.toggle('dark', theme === 'dark');
            saveState();
            renderSettingsScreen(); // Re-render to update button styles
        };
    });

    // Font Size Switcher
    ['small', 'medium', 'large'].forEach(size => {
        const btn = document.getElementById(`font-${size}`);
        btn.classList.toggle('selected', appState.settings.fontSize === size);
        btn.onclick = () => {
            appState.settings.fontSize = size;
            document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize} nav-${appState.settings.navigationMode}`;
            saveState();
            renderSettingsScreen(); // Re-render to update button styles
        };
    });

    // Navigation Mode Switcher
    ['scroll', 'step'].forEach(mode => {
        const btn = document.getElementById(`nav-${mode}`);
        btn.classList.toggle('selected', appState.settings.navigationMode === mode);
        btn.onclick = () => {
            appState.settings.navigationMode = mode;
            document.body.classList.remove('nav-scroll', 'nav-step');
            document.body.classList.add(`nav-${mode}`);
            saveState();
            renderSettingsScreen(); // Re-render to update button styles
        };
    });

    // Data Management
    document.getElementById('btn-export-data').onclick = exportData;
    
    const importFileEl = document.getElementById('import-file');
    const importBtn = document.getElementById('btn-import-data');
    
    importBtn.onclick = () => importFileEl.click();
    importFileEl.onchange = importData;

    document.getElementById('btn-clear-cache').onclick = clearCache;
    document.getElementById('btn-settings-back').onclick = () => showScreen('main-menu');
}

function exportData() {
    const data = {
        answers: appState.answers,
        results: appState.results,
        bookmarks: appState.bookmarks,
        settings: appState.settings,
        questionBanks: {}
    };

    // Include question banks
    Object.keys(SECTIONS).forEach(sectionName => {
        const savedKey = `examQuestions_${sectionName}`;
        data.questionBanks[sectionName] = localStorage.getItem(savedKey) ? JSON.parse(localStorage.getItem(savedKey)) : null;
    });

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ce_exam_simulator_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Exam data exported successfully!');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.answers || !importedData.results || !importedData.bookmarks || !importedData.settings) {
                throw new Error("Invalid import file structure.");
            }

            // Confirm import
            showConfirmModal(
                "Confirm Data Import",
                "This will overwrite all existing exam data (answers, results, bookmarks). Are you sure?",
                () => {
                    // Update main state
                    appState.answers = importedData.answers;
                    appState.results = importedData.results;
                    appState.bookmarks = importedData.bookmarks;
                    appState.settings = importedData.settings;

                    // Update local storage
                    localStorage.setItem('examAnswers', JSON.stringify(appState.answers));
                    localStorage.setItem('examResults', JSON.stringify(appState.results));
                    localStorage.setItem('examBookmarks', JSON.stringify(appState.bookmarks));
                    localStorage.setItem('examSettings', JSON.stringify(appState.settings));
                    
                    // Import question banks
                    if (importedData.questionBanks) {
                        Object.entries(importedData.questionBanks).forEach(([sectionName, questions]) => {
                            if (questions) {
                                localStorage.setItem(`examQuestions_${sectionName}`, JSON.stringify(questions));
                            }
                        });
                    }

                    // Re-apply theme and show main menu
                    document.documentElement.classList.toggle('dark', appState.settings.theme === 'dark');
                    document.body.className = `${appState.settings.theme} font-${appState.settings.fontSize} nav-${appState.settings.navigationMode}`;

                    alert('Data imported successfully!');
                    showScreen('main-menu');
                }
            );

        } catch (error) {
            alert(`Error importing data: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

function clearCache() {
    showConfirmModal(
        "Confirm Cache Reset",
        "This will permanently delete all exam data from your browser (answers, results, bookmarks, saved settings). Are you sure?",
        () => {
            localStorage.clear();
            // Reset appState to initial values
            appState = {
                view: 'loading',
                settings: { theme: 'light', fontSize: 'medium', autoSave: true, navigationMode: 'scroll' },
                answers: {},
                results: {},
                bookmarks: [],
                currentSection: null,
                timeLeft: 0,
                timerInterval: null,
                examQuestions: [],
                reviewingSection: null,
                fullQuestionBank: [],
                isPaused: false,
                firstWrongIndex: null
            };
            document.documentElement.classList.remove('dark');
            document.body.className = 'light';
            alert('All data has been cleared!');
            showScreen('main-menu');
        }
    );
}

// ======================
// FULL MOCK EXAM
// ======================
function startFullMockExam() {
    showConfirmModal(
        "Start Full Mock Exam",
        "A full mock exam will combine all sections. Questions will be randomized and the total time is 14 hours. Are you ready to begin?",
        () => {
            // Logic to merge all question banks and start a combined timer
            alert("Full Mock Exam is a feature that needs full question banks. Starting a single section for demonstration.");
            // For now, redirect to start the first section or simply the main menu
            // In a real application, you would create a new combined question set and state.
            appState.currentSection = Object.keys(SECTIONS)[0];
            showScreen('instructions');
        }
    );
}

// ======================
// PDF GENERATION
// ======================
function generateOfflinePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'pt',
        format: 'letter'
    });

    const pdfContainer = document.getElementById('pdf-container');
    pdfContainer.innerHTML = '';
    pdfContainer.classList.remove('hidden');

    const sectionsToPrint = Object.values(SECTIONS);

    let contentHTML = `
        <h1>Civil Engineering Exam Simulator - Offline PDF</h1>
        <p style="text-align: center; margin-bottom: 24pt;">(For Practice - Not to be used as actual examination material)</p>
    `;

    sectionsToPrint.forEach(section => {
        const questions = localStorage.getItem(`examQuestions_${section.name}`);
        if (!questions) {
            contentHTML += `<h2>${section.title} (${section.name}) - Questions Not Found</h2>`;
            return;
        }

        const sectionQuestions = JSON.parse(questions);
        contentHTML += `
            <div style="page-break-before: always; column-span: all;">
                <h2>${section.title} (${section.name})</h2>
                <p><strong>Total Questions:</strong> ${section.total} &nbsp;&nbsp;&nbsp; <strong>Time Allotment:</strong> ${section.time / 3600} hours</p>
            </div>
        `;

        let currentGroupId = null;

        sectionQuestions.forEach((question, index) => {
            // Handle Situation Questions
            if (question.group_id && question.stem.trim().startsWith('Situation')) {
                currentGroupId = question.group_id;
                contentHTML += `
                    <div class="situation-header">Situation ${question.group_id}</div>
                `;
            } else if (question.group_id && question.group_id !== currentGroupId) {
                currentGroupId = question.group_id; // Start of a new group without a 'Situation' stem (less common, but handled)
            } else if (!question.group_id) {
                currentGroupId = null;
            }

            // Handle figure placement for situations
            if (question.figure) {
                 contentHTML += `
                    <div class="figure-card">
                        <p class="figure-label">Figure for Question(s) ${question.group_id || (index + 1)}</p>
                        <img src="${question.figure}" style="max-height: 200pt; max-width: 90%;">
                    </div>
                 `;
            }

            // Main Question Card
            contentHTML += `
                <div class="question-card">
                    <p class="question-number">Question ${index + 1}</p>
                    <p class="question-stem">${question.stem}</p>
                    ${question.choices.map((choice, choiceIndex) => {
                        const letter = String.fromCharCode(65 + choiceIndex);
                        return `<p class="choice-line"><span class="choice-letter">${letter}.</span> ${choice.trim()}</p>`;
                    }).join('')}
                </div>
            `;
        });
    });

    // Add Answer Key Section
    contentHTML += `
        <div style="page-break-before: always; column-span: all;">
            <h1>Answer Key</h1>
        </div>
    `;
    sectionsToPrint.forEach(section => {
        const questions = localStorage.getItem(`examQuestions_${section.name}`);
        if (!questions) return;
        const sectionQuestions = JSON.parse(questions);
        
        contentHTML += `<div style="column-span: all;"><h2>${section.title} (${section.name})</h2></div>`;

        let answerKeyHTML = '';
        sectionQuestions.forEach((question, index) => {
            if (index % 5 === 0 && index !== 0) {
                answerKeyHTML += '</div><div style="break-inside: avoid;">';
            }
            if (index % 50 === 0 && index !== 0) {
                 answerKeyHTML += '</div><div style="page-break-before: always;">';
            }
            
            answerKeyHTML += `
                <div style="margin-bottom: 4pt; break-inside: avoid;">
                    <strong>Q${index + 1}:</strong> ${question.correct_answer}
                </div>
            `;
        });
        
        contentHTML += `<div style="column-count: 2; column-gap: 1.5rem; margin-bottom: 1rem;">${answerKeyHTML}</div>`;
    });

    pdfContainer.innerHTML = contentHTML;

    // Use html2canvas and jspdf to generate the PDF
    // Since html2canvas is not directly available in this environment,
    // we use a simple window.print() as a fallback which relies on the @media print CSS
    try {
        window.print();
    } catch (e) {
        alert("PDF generation failed. The browser print dialog is not available.");
        console.error("PDF generation error:", e);
    }
    
    // Clean up
    pdfContainer.classList.add('hidden');
}


// ======================
// FALLBACK QUESTIONS (Since question_bank.json is not provided)
// ======================

function getIndividualAMSTHECQuestion(index) {
    return `Situation: A 500m simple curve has a central angle of 30 degrees. Q${index % 3 + 1}: Find the length of the curve.`;
}
function getIndividualAMSTHECChoices(index) {
    return ["261.8m", "300.0m", "500.0m", "523.6m"];
}
function getIndividualAMSTHECAnswer(index) {
    return "A";
}

function getIndividualHPGEQuestion(index) {
    return `Situation: A constant head permeability test is performed. The soil is 15cm long and 6cm diameter. Water flows under a head of 30cm for 5 minutes, collecting 100mL of water. Q${index % 3 + 1}: Calculate permeability from constant head test.`;
}
function getIndividualHPGEChoices(index) {
    return ["1×10⁻⁵ cm/s", "2×10⁻⁵ cm/s", "3×10⁻⁵ cm/s", "4×10⁻⁵ cm/s"];
}
function getIndividualHPGEAnswer(index) {
    return "B";
}

function getIndividualPSADQuestion(index) {
    return `Situation: A three-story building with a total weight of 1500kN is subjected to a base shear of 150kN. Q${index % 3 + 1}: Calculate natural period of vibration.`;
}
function getIndividualPSADChoices(index) {
    return ["0.6 s", "0.7 s", "0.8 s", "0.9 s"];
}
function getIndividualPSADAnswer(index) {
    return "C";
}

function getFallbackQuestions() {
    const fallbackBank = [];
    const sectionGenerators = {
        AMSTHEC: { total: 75, q: getIndividualAMSTHECQuestion, c: getIndividualAMSTHECChoices, a: getIndividualAMSTHECAnswer },
        HPGE: { total: 50, q: getIndividualHPGEQuestion, c: getIndividualHPGEChoices, a: getIndividualHPGEAnswer },
        PSAD: { total: 75, q: getIndividualPSADQuestion, c: getIndividualPSADChoices, a: getIndividualPSADAnswer },
    };

    Object.entries(sectionGenerators).forEach(([sectionName, gen]) => {
        for (let i = 0; i < gen.total; i++) {
            const group_id = Math.floor(i / 3) + 1; // Creates groups of 3
            fallbackBank.push({
                section: sectionName,
                group_id: `FB-${sectionName}-${group_id}`,
                stem: gen.q(i),
                choices: gen.c(i),
                correct_answer: gen.a(i),
                explanation: `This is a sample explanation for Question ${i + 1} in ${sectionName}.`
            });
        }
    });

    return fallbackBank;
}

function getSampleQuestions(sectionName) {
    return getFallbackQuestions().filter(q => q.section === sectionName);
}


// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', async () => {
    // Set theme based on saved settings
    if (appState.settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
    }
    // Set font size and navigation mode
    document.body.classList.add(`font-${appState.settings.fontSize}`, `nav-${appState.settings.navigationMode}`);

    showScreen('loading');
    
    // Load external libraries if needed (e.g., Chart.js)
    if (!window.Chart) {
        const chartScript = document.createElement('script');
        chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js';
        document.head.appendChild(chartScript);
    }
    
    // Load questions and transition to main menu
    try {
        await loadQuestionBank();
        setTimeout(() => showScreen('main-menu'), 1000);
    } catch (error) {
        console.error('Failed to initialize app:', error);
        setTimeout(() => showScreen('main-menu'), 1000); // Show main menu even on error
    }

    // Modal close handlers
    document.getElementById('close-image-modal').onclick = () => {
        document.getElementById('image-modal').classList.add('hidden');
    };
});
