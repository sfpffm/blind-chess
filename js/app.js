// app.js - UI logic for Blind Chess

(function () {
  let game;
  const moveListEl = document.getElementById('moveList');
  const moveInput = document.getElementById('moveInput');
  const submitBtn = document.getElementById('submitBtn');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('errorMsg');
  const thinkingEl = document.getElementById('thinking');

  function init() {
    game = Chess.createGame();
    renderMoveList();
    updateStatus();
    moveInput.value = '';
    moveInput.focus();
    errorEl.textContent = '';
  }

  function renderMoveList() {
    const history = game.getHistory();
    if (history.length === 0) {
      moveListEl.innerHTML =
        '<div class="empty-state">' +
        '<div>Dein Zug, Weiss.</div>' +
        '<div class="hint">z.B. e2-e4</div>' +
        '</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = history[i];
      const blackMove = history[i + 1];
      const isLatestWhite = i === history.length - 1;
      const isLatestBlack = i + 1 === history.length - 1;

      html += '<div class="move-row">';
      html += '<span class="move-number">' + moveNum + '.</span>';
      html += '<span class="move-white' + (isLatestWhite ? ' latest' : '') + '">' + whiteMove.notation + '</span>';
      if (blackMove) {
        html += '<span class="move-black' + (isLatestBlack ? ' latest' : '') + '">' + blackMove.notation + '</span>';
      }
      html += '</div>';
    }
    moveListEl.innerHTML = html;
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function updateStatus() {
    const status = game.getStatus();
    statusEl.className = 'status';

    if (status === 'white_wins') {
      statusEl.textContent = 'Schachmatt! Schwarz gewinnt.';
      statusEl.className = 'status gameover';
      moveInput.disabled = true;
      submitBtn.disabled = true;
    } else if (status === 'black_wins') {
      statusEl.textContent = 'Schachmatt! Weiss gewinnt.';
      statusEl.className = 'status gameover';
      moveInput.disabled = true;
      submitBtn.disabled = true;
    } else if (status === 'stalemate') {
      statusEl.textContent = 'Patt! Unentschieden.';
      statusEl.className = 'status gameover';
      moveInput.disabled = true;
      submitBtn.disabled = true;
    } else if (status === 'draw_50') {
      statusEl.textContent = 'Remis (50-Zuege-Regel).';
      statusEl.className = 'status gameover';
      moveInput.disabled = true;
      submitBtn.disabled = true;
    } else {
      const turnText = game.getTurn() === game.WHITE ? 'Weiss' : 'Schwarz';
      const checkText = game.inCheck(game.getTurn()) ? ' — Schach!' : '';
      if (checkText) {
        statusEl.className = 'status check';
      }
      statusEl.innerHTML = turnText + ' am Zug' + checkText +
        ' <span id="thinking" class="thinking">&#9679; denkt...</span>';
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    moveInput.classList.add('error');
    setTimeout(() => moveInput.classList.remove('error'), 300);
    setTimeout(() => { errorEl.textContent = ''; }, 2500);
  }

  function submitMove() {
    const input = moveInput.value.trim();
    if (!input) return;

    if (game.getStatus() !== 'playing') return;
    if (game.getTurn() !== game.WHITE) return;

    const result = game.doMove(input);
    if (!result) {
      showError('Ungueltiger Zug! z.B. e4, Nf3, O-O');
      moveInput.select();
      return;
    }

    moveInput.value = '';
    errorEl.textContent = '';
    renderMoveList();
    updateStatus();

    // Check if game is over after player's move
    if (game.getStatus() !== 'playing') return;

    // AI's turn
    moveInput.disabled = true;
    submitBtn.disabled = true;
    const thinkingSpan = document.getElementById('thinking');
    if (thinkingSpan) thinkingSpan.classList.add('active');

    // Use setTimeout to let UI update before computation
    setTimeout(() => {
      const aiMove = ChessEngine.findBestMove(game, 4);
      if (aiMove) {
        const notation = game.moveToNotation(aiMove);
        const undo = game.makeMove(aiMove);
        game.getHistory().push({ move: aiMove, undo: undo, notation: addCheckSuffix(notation) });
      }

      moveInput.disabled = false;
      submitBtn.disabled = false;
      renderMoveList();
      updateStatus();
      moveInput.focus();
    }, 50);
  }

  function addCheckSuffix(notation) {
    const legal = game.legalMoves();
    if (game.inCheck(game.getTurn())) {
      return notation + (legal.length === 0 ? '#' : '+');
    }
    return notation;
  }

  function undoLastPair() {
    // Undo both black's and white's last move
    const history = game.getHistory();
    if (history.length === 0) return;

    // Undo black's move if it was last
    if (history.length > 0 && history[history.length - 1].undo) {
      game.undoMove(history[history.length - 1].undo);
      history.pop();
    }
    // Undo white's move
    if (history.length > 0 && history[history.length - 1].undo) {
      game.undoMove(history[history.length - 1].undo);
      history.pop();
    }

    moveInput.disabled = false;
    submitBtn.disabled = false;
    renderMoveList();
    updateStatus();
    moveInput.focus();
  }

  // Board rendering
  const boardOverlay = document.getElementById('boardOverlay');
  const boardCanvas = document.getElementById('boardCanvas');
  const boardCtx = boardCanvas.getContext('2d');

  const PIECE_UNICODE = {
    17: '\u2659', 18: '\u2658', 19: '\u2657', 20: '\u2656', 21: '\u2655', 22: '\u2654', // white P N B R Q K
    33: '\u265F', 34: '\u265E', 35: '\u265D', 36: '\u265C', 37: '\u265B', 38: '\u265A', // black P N B R Q K
  };

  function drawBoard() {
    const size = boardCanvas.width;
    const sq = size / 8;
    const lightColor = '#f0d9b5';
    const darkColor = '#b58863';
    const board = game.getBoard();

    boardCtx.clearRect(0, 0, size, size);

    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const x = file * sq;
        const y = (7 - rank) * sq;
        const isLight = (file + rank) % 2 === 1;

        // Square
        boardCtx.fillStyle = isLight ? lightColor : darkColor;
        boardCtx.fillRect(x, y, sq, sq);

        // Piece
        const sqIdx = rank * 16 + file;
        const piece = board[sqIdx];
        if (piece !== 0) {
          const unicode = PIECE_UNICODE[piece];
          if (unicode) {
            boardCtx.font = (sq * 0.75) + 'px serif';
            boardCtx.textAlign = 'center';
            boardCtx.textBaseline = 'middle';
            // Shadow for readability
            boardCtx.fillStyle = 'rgba(0,0,0,0.3)';
            boardCtx.fillText(unicode, x + sq / 2 + 1, y + sq / 2 + 1);
            boardCtx.fillStyle = (piece & 16) ? '#ffffff' : '#1a1a1a';
            boardCtx.fillText(unicode, x + sq / 2, y + sq / 2);
          }
        }

        // File labels (bottom row)
        if (rank === 0) {
          boardCtx.font = '10px sans-serif';
          boardCtx.textAlign = 'right';
          boardCtx.textBaseline = 'bottom';
          boardCtx.fillStyle = isLight ? darkColor : lightColor;
          boardCtx.fillText('abcdefgh'[file], x + sq - 2, y + sq - 2);
        }
        // Rank labels (left column)
        if (file === 0) {
          boardCtx.font = '10px sans-serif';
          boardCtx.textAlign = 'left';
          boardCtx.textBaseline = 'top';
          boardCtx.fillStyle = isLight ? darkColor : lightColor;
          boardCtx.fillText(rank + 1, x + 2, y + 2);
        }
      }
    }
  }

  function showBoard() {
    drawBoard();
    boardOverlay.classList.remove('hidden');
  }

  function hideBoard() {
    boardOverlay.classList.add('hidden');
    moveInput.focus();
  }

  document.getElementById('showBoardBtn').addEventListener('click', showBoard);
  document.getElementById('closeBoardBtn').addEventListener('click', hideBoard);
  boardOverlay.addEventListener('click', function (e) {
    if (e.target === boardOverlay) hideBoard();
  });

  // Event listeners
  submitBtn.addEventListener('click', submitMove);

  moveInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitMove();
    }
  });

  document.getElementById('newGameBtn').addEventListener('click', function () {
    init();
  });

  document.getElementById('undoBtn').addEventListener('click', function () {
    undoLastPair();
  });

  // Initialize
  init();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
