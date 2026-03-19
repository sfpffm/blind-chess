// chess.js - Complete chess game logic
// Board representation using 0x88 for efficient move generation

const Chess = (() => {
  // Piece constants
  const EMPTY = 0;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const WHITE = 16, BLACK = 32;

  const PIECE_CHARS = {
    [WHITE | PAWN]: 'P', [WHITE | KNIGHT]: 'N', [WHITE | BISHOP]: 'B',
    [WHITE | ROOK]: 'R', [WHITE | QUEEN]: 'Q', [WHITE | KING]: 'K',
    [BLACK | PAWN]: 'p', [BLACK | KNIGHT]: 'n', [BLACK | BISHOP]: 'b',
    [BLACK | ROOK]: 'r', [BLACK | QUEEN]: 'q', [BLACK | KING]: 'k',
  };

  const CHAR_TO_PIECE = {};
  for (const [k, v] of Object.entries(PIECE_CHARS)) CHAR_TO_PIECE[v] = parseInt(k);

  // 0x88 board: indices 0-127, valid squares have (index & 0x88) === 0
  const FILES = 'abcdefgh';
  const RANKS = '12345678';

  function sqIndex(file, rank) { return rank * 16 + file; }
  function sqFile(sq) { return sq & 7; }
  function sqRank(sq) { return sq >> 4; }
  function isValid(sq) { return (sq & 0x88) === 0; }
  function sqName(sq) { return FILES[sqFile(sq)] + RANKS[sqRank(sq)]; }
  function nameToSq(name) {
    const f = FILES.indexOf(name[0].toLowerCase());
    const r = RANKS.indexOf(name[1]);
    if (f < 0 || r < 0) return -1;
    return sqIndex(f, r);
  }

  // Direction offsets for 0x88
  const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP_OFFSETS = [-17, -15, 15, 17];
  const ROOK_OFFSETS = [-16, -1, 1, 16];
  const QUEEN_OFFSETS = [...BISHOP_OFFSETS, ...ROOK_OFFSETS];
  const KING_OFFSETS = QUEEN_OFFSETS;

  // Pawn directions
  const PAWN_PUSH = { [WHITE]: 16, [BLACK]: -16 };
  const PAWN_START_RANK = { [WHITE]: 1, [BLACK]: 6 };
  const PAWN_PROMO_RANK = { [WHITE]: 7, [BLACK]: 0 };
  const PAWN_CAPTURE = { [WHITE]: [15, 17], [BLACK]: [-17, -15] };

  function pieceColor(p) { return p & 0x30; }
  function pieceType(p) { return p & 0x0F; }

  function createGame() {
    const board = new Array(128).fill(EMPTY);
    let turn = WHITE;
    let castling = { wk: true, wq: true, bk: true, bq: true };
    let enPassant = -1; // target square
    let halfMoves = 0;
    let fullMoves = 1;
    const history = [];

    // Set up initial position
    function reset() {
      board.fill(EMPTY);
      const backRank = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
      for (let f = 0; f < 8; f++) {
        board[sqIndex(f, 0)] = WHITE | backRank[f];
        board[sqIndex(f, 1)] = WHITE | PAWN;
        board[sqIndex(f, 6)] = BLACK | PAWN;
        board[sqIndex(f, 7)] = BLACK | backRank[f];
      }
      turn = WHITE;
      castling = { wk: true, wq: true, bk: true, bq: true };
      enPassant = -1;
      halfMoves = 0;
      fullMoves = 1;
      history.length = 0;
    }

    function findKing(color) {
      const king = color | KING;
      for (let sq = 0; sq < 128; sq++) {
        if (!isValid(sq)) continue;
        if (board[sq] === king) return sq;
      }
      return -1;
    }

    function isAttacked(sq, byColor) {
      // Check knight attacks
      for (const off of KNIGHT_OFFSETS) {
        const t = sq + off;
        if (isValid(t) && board[t] === (byColor | KNIGHT)) return true;
      }
      // Check king attacks
      for (const off of KING_OFFSETS) {
        const t = sq + off;
        if (isValid(t) && board[t] === (byColor | KING)) return true;
      }
      // Check pawn attacks
      const pawnDir = byColor === WHITE ? -1 : 1;
      for (const off of [pawnDir * 16 - 1, pawnDir * 16 + 1]) {
        const t = sq + off;
        if (isValid(t) && board[t] === (byColor | PAWN)) return true;
      }
      // Check sliding pieces (bishop/queen on diagonals, rook/queen on straights)
      for (const off of BISHOP_OFFSETS) {
        let t = sq + off;
        while (isValid(t)) {
          if (board[t] !== EMPTY) {
            if (pieceColor(board[t]) === byColor &&
                (pieceType(board[t]) === BISHOP || pieceType(board[t]) === QUEEN)) return true;
            break;
          }
          t += off;
        }
      }
      for (const off of ROOK_OFFSETS) {
        let t = sq + off;
        while (isValid(t)) {
          if (board[t] !== EMPTY) {
            if (pieceColor(board[t]) === byColor &&
                (pieceType(board[t]) === ROOK || pieceType(board[t]) === QUEEN)) return true;
            break;
          }
          t += off;
        }
      }
      return false;
    }

    function inCheck(color) {
      const kSq = findKing(color);
      if (kSq < 0) return false;
      const enemy = color === WHITE ? BLACK : WHITE;
      return isAttacked(kSq, enemy);
    }

    // Generate all pseudo-legal moves for current turn
    function generatePseudoMoves() {
      const moves = [];
      for (let sq = 0; sq < 128; sq++) {
        if (!isValid(sq)) continue;
        const p = board[sq];
        if (p === EMPTY || pieceColor(p) !== turn) continue;
        const type = pieceType(p);

        if (type === PAWN) {
          const push = PAWN_PUSH[turn];
          const startRank = PAWN_START_RANK[turn];
          const promoRank = PAWN_PROMO_RANK[turn];
          // Single push
          const t1 = sq + push;
          if (isValid(t1) && board[t1] === EMPTY) {
            if (sqRank(t1) === promoRank) {
              for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                moves.push({ from: sq, to: t1, promotion: promo });
              }
            } else {
              moves.push({ from: sq, to: t1 });
              // Double push
              if (sqRank(sq) === startRank) {
                const t2 = sq + push * 2;
                if (board[t2] === EMPTY) {
                  moves.push({ from: sq, to: t2 });
                }
              }
            }
          }
          // Captures
          for (const off of PAWN_CAPTURE[turn]) {
            const tc = sq + off;
            if (!isValid(tc)) continue;
            const enemy = turn === WHITE ? BLACK : WHITE;
            if (board[tc] !== EMPTY && pieceColor(board[tc]) === enemy) {
              if (sqRank(tc) === promoRank) {
                for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                  moves.push({ from: sq, to: tc, promotion: promo });
                }
              } else {
                moves.push({ from: sq, to: tc });
              }
            }
            // En passant
            if (tc === enPassant) {
              moves.push({ from: sq, to: tc, enPassant: true });
            }
          }
        } else if (type === KNIGHT) {
          for (const off of KNIGHT_OFFSETS) {
            const t = sq + off;
            if (!isValid(t)) continue;
            if (board[t] === EMPTY || pieceColor(board[t]) !== turn) {
              moves.push({ from: sq, to: t });
            }
          }
        } else if (type === KING) {
          for (const off of KING_OFFSETS) {
            const t = sq + off;
            if (!isValid(t)) continue;
            if (board[t] === EMPTY || pieceColor(board[t]) !== turn) {
              moves.push({ from: sq, to: t });
            }
          }
          // Castling
          if (!inCheck(turn)) {
            if (turn === WHITE) {
              if (castling.wk && board[sqIndex(5, 0)] === EMPTY && board[sqIndex(6, 0)] === EMPTY &&
                  board[sqIndex(7, 0)] === (WHITE | ROOK) &&
                  !isAttacked(sqIndex(5, 0), BLACK) && !isAttacked(sqIndex(6, 0), BLACK)) {
                moves.push({ from: sq, to: sqIndex(6, 0), castling: 'K' });
              }
              if (castling.wq && board[sqIndex(3, 0)] === EMPTY && board[sqIndex(2, 0)] === EMPTY &&
                  board[sqIndex(1, 0)] === EMPTY && board[sqIndex(0, 0)] === (WHITE | ROOK) &&
                  !isAttacked(sqIndex(3, 0), BLACK) && !isAttacked(sqIndex(2, 0), BLACK)) {
                moves.push({ from: sq, to: sqIndex(2, 0), castling: 'Q' });
              }
            } else {
              if (castling.bk && board[sqIndex(5, 7)] === EMPTY && board[sqIndex(6, 7)] === EMPTY &&
                  board[sqIndex(7, 7)] === (BLACK | ROOK) &&
                  !isAttacked(sqIndex(5, 7), WHITE) && !isAttacked(sqIndex(6, 7), WHITE)) {
                moves.push({ from: sq, to: sqIndex(6, 7), castling: 'k' });
              }
              if (castling.bq && board[sqIndex(3, 7)] === EMPTY && board[sqIndex(2, 7)] === EMPTY &&
                  board[sqIndex(1, 7)] === EMPTY && board[sqIndex(0, 7)] === (BLACK | ROOK) &&
                  !isAttacked(sqIndex(3, 7), WHITE) && !isAttacked(sqIndex(2, 7), WHITE)) {
                moves.push({ from: sq, to: sqIndex(2, 7), castling: 'q' });
              }
            }
          }
        } else {
          // Sliding pieces
          let offsets;
          if (type === BISHOP) offsets = BISHOP_OFFSETS;
          else if (type === ROOK) offsets = ROOK_OFFSETS;
          else offsets = QUEEN_OFFSETS;
          for (const off of offsets) {
            let t = sq + off;
            while (isValid(t)) {
              if (board[t] === EMPTY) {
                moves.push({ from: sq, to: t });
              } else {
                if (pieceColor(board[t]) !== turn) {
                  moves.push({ from: sq, to: t });
                }
                break;
              }
              t += off;
            }
          }
        }
      }
      return moves;
    }

    // Make a move (mutates board), returns undo info
    function makeMove(move) {
      const undo = {
        from: move.from,
        to: move.to,
        piece: board[move.from],
        captured: board[move.to],
        castling: { ...castling },
        enPassant,
        halfMoves,
        fullMoves,
        epCaptured: EMPTY,
        castlingRookFrom: -1,
        castlingRookTo: -1,
      };

      const p = board[move.from];
      const type = pieceType(p);
      const color = pieceColor(p);

      // Handle en passant capture
      if (move.enPassant) {
        const epPawnSq = move.to + (color === WHITE ? -16 : 16);
        undo.epCaptured = board[epPawnSq];
        undo.epPawnSq = epPawnSq;
        board[epPawnSq] = EMPTY;
      }

      // Handle castling
      if (move.castling) {
        let rookFrom, rookTo;
        if (move.castling === 'K' || move.castling === 'k') {
          rookFrom = move.to + 1;
          rookTo = move.to - 1;
        } else {
          rookFrom = move.to - 2;
          rookTo = move.to + 1;
        }
        board[rookTo] = board[rookFrom];
        board[rookFrom] = EMPTY;
        undo.castlingRookFrom = rookFrom;
        undo.castlingRookTo = rookTo;
      }

      // Move piece
      board[move.to] = move.promotion ? (color | move.promotion) : p;
      board[move.from] = EMPTY;

      // Update en passant
      if (type === PAWN && Math.abs(sqRank(move.to) - sqRank(move.from)) === 2) {
        enPassant = move.from + PAWN_PUSH[color];
      } else {
        enPassant = -1;
      }

      // Update castling rights
      if (type === KING) {
        if (color === WHITE) { castling.wk = false; castling.wq = false; }
        else { castling.bk = false; castling.bq = false; }
      }
      if (type === ROOK) {
        if (move.from === sqIndex(0, 0)) castling.wq = false;
        if (move.from === sqIndex(7, 0)) castling.wk = false;
        if (move.from === sqIndex(0, 7)) castling.bq = false;
        if (move.from === sqIndex(7, 7)) castling.bk = false;
      }
      // If a rook is captured
      if (move.to === sqIndex(0, 0)) castling.wq = false;
      if (move.to === sqIndex(7, 0)) castling.wk = false;
      if (move.to === sqIndex(0, 7)) castling.bq = false;
      if (move.to === sqIndex(7, 7)) castling.bk = false;

      // Update half moves
      if (type === PAWN || undo.captured !== EMPTY) {
        halfMoves = 0;
      } else {
        halfMoves++;
      }

      // Update full moves
      if (color === BLACK) fullMoves++;

      // Switch turn
      turn = color === WHITE ? BLACK : WHITE;

      return undo;
    }

    function undoMove(undo) {
      board[undo.from] = undo.piece;
      board[undo.to] = undo.captured;

      if (undo.epCaptured !== EMPTY) {
        board[undo.epPawnSq] = undo.epCaptured;
      }

      if (undo.castlingRookFrom >= 0) {
        board[undo.castlingRookFrom] = board[undo.castlingRookTo];
        board[undo.castlingRookTo] = EMPTY;
      }

      castling = undo.castling;
      enPassant = undo.enPassant;
      halfMoves = undo.halfMoves;
      fullMoves = undo.fullMoves;
      turn = pieceColor(undo.piece);
    }

    // Generate legal moves
    function legalMoves() {
      const pseudo = generatePseudoMoves();
      const legal = [];
      for (const move of pseudo) {
        const undo = makeMove(move);
        if (!inCheck(pieceColor(undo.piece))) {
          legal.push(move);
        }
        undoMove(undo);
      }
      return legal;
    }

    // Parse user input - supports both long (e2-e4) and short (e4, Nf3, Bxe5, O-O) notation
    function parseMove(input) {
      input = input.trim();
      const legal = legalMoves();
      if (legal.length === 0) return null;

      // Castling: O-O, O-O-O, 0-0, 0-0-0
      const castleInput = input.replace(/0/g, 'O').replace(/o/g, 'O').replace(/\s/g, '');
      if (castleInput === 'O-O' || castleInput === 'OO') {
        return legal.find(m => m.castling === 'K' || m.castling === 'k') || null;
      }
      if (castleInput === 'O-O-O' || castleInput === 'OOO') {
        return legal.find(m => m.castling === 'Q' || m.castling === 'q') || null;
      }

      // Try long notation first: e2-e4, e2e4
      const longClean = input.toLowerCase().replace(/[^a-h1-8]/g, '');
      if (longClean.length >= 4) {
        const fromName = longClean.slice(0, 2);
        const toName = longClean.slice(2, 4);
        const promoChar = longClean.length > 4 ? longClean[4] : '';
        const from = nameToSq(fromName);
        const to = nameToSq(toName);
        if (from >= 0 && to >= 0) {
          const matches = legal.filter(m => m.from === from && m.to === to);
          if (matches.length > 0) {
            if (matches.length > 1 && matches[0].promotion) {
              const promoMap = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };
              const promo = promoMap[promoChar] || QUEEN;
              return matches.find(m => m.promotion === promo) || matches[0];
            }
            return matches[0];
          }
        }
      }

      // Short notation: e4, Nf3, Bxe5, Nbd2, R1e1, exd5, e8=Q
      // Also German: Sf3, Lg5, Td1, De2
      // Remove check/mate symbols and capture 'x'
      let san = input.replace(/[+#!?]/g, '').trim();

      // Map German/lowercase piece letters to English before parsing
      // S=Springer(Knight), L=Laeufer(Bishop), T=Turm(Rook), D=Dame(Queen)
      // Also handle lowercase: s, l, t, d + English: n, b, r, q, k
      const pieceLetterMap = {
        S: 'N', s: 'N', L: 'B', l: 'B', T: 'R', t: 'R', D: 'Q', d: 'Q',
        N: 'N', n: 'N', B: 'B', b: 'B', R: 'R', r: 'R', Q: 'Q', q: 'Q',
        K: 'K', k: 'K',
      };
      // A piece letter followed by a file (a-h) or 'x' indicates a piece move
      if (san.length >= 2 && pieceLetterMap[san[0]] &&
          ('abcdefghx'.includes(san[1]) || '12345678'.includes(san[1]))) {
        // Avoid mistaking pawn file letters (b, d) for piece letters
        // 'b' or 'd' followed by a digit is ambiguous: could be Bd4 or pawn b/d + rank
        // If first char is b/d lowercase and second char is a digit, prefer pawn interpretation
        const fc = san[0];
        const sc = san[1];
        const isPawnFile = ('abcdefgh'.includes(fc) && '12345678'.includes(sc));
        const couldBePiece = pieceLetterMap[fc] && !isPawnFile;
        if (couldBePiece) {
          san = pieceLetterMap[fc] + san.slice(1);
        }
      }

      // Extract promotion: =Q, =N, =D, =S, etc.
      let promoType = null;
      const promoMatch = san.match(/[=]?([QRBNDSTLqrbndstl])$/);
      if (promoMatch && san.length > 2) {
        let pc = promoMatch[1].toUpperCase();
        if (germanMap[pc]) pc = germanMap[pc];
        const promoMap = { Q: QUEEN, R: ROOK, B: BISHOP, N: KNIGHT };
        if (promoMap[pc]) {
          promoType = promoMap[pc];
          san = san.slice(0, san.length - promoMatch[0].length);
        }
      }

      // Remove 'x' for captures
      san = san.replace(/x/gi, '');

      // Determine piece type and target square
      let targetPieceType = PAWN;
      let disambigFile = -1;
      let disambigRank = -1;
      let targetFile = -1;
      let targetRank = -1;

      if (san.length === 0) return null;

      const firstChar = san[0];
      // Piece move: starts with uppercase N, B, R, Q, K
      if ('NBRQK'.includes(firstChar)) {
        const pieceMap = { N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };
        targetPieceType = pieceMap[firstChar];
        san = san.slice(1);
      }

      // Now san should end with target square (e.g. "f3", "bd2", "1e1")
      if (san.length < 2) return null;

      // Last two chars = target square
      targetFile = FILES.indexOf(san[san.length - 2]);
      targetRank = RANKS.indexOf(san[san.length - 1]);
      if (targetFile < 0 || targetRank < 0) return null;

      // Disambiguation chars (everything before target square)
      const disambig = san.slice(0, san.length - 2);
      for (const c of disambig) {
        if (FILES.includes(c)) disambigFile = FILES.indexOf(c);
        else if (RANKS.includes(c)) disambigRank = RANKS.indexOf(c);
      }

      const targetSq = sqIndex(targetFile, targetRank);

      // Find matching legal moves
      const matches = legal.filter(m => {
        if (m.to !== targetSq) return false;
        if (m.castling) return false;
        const p = board[m.from];
        if (pieceType(p) !== targetPieceType) return false;
        if (disambigFile >= 0 && sqFile(m.from) !== disambigFile) return false;
        if (disambigRank >= 0 && sqRank(m.from) !== disambigRank) return false;
        if (promoType && m.promotion !== promoType) return false;
        if (promoType && !m.promotion) return false;
        return true;
      });

      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        // If promotion ambiguity, default to queen
        if (matches[0].promotion) {
          return matches.find(m => m.promotion === (promoType || QUEEN)) || matches[0];
        }
        return matches[0];
      }

      return null;
    }

    // Format a move as SAN (Standard Algebraic Notation)
    function moveToNotation(move) {
      if (move.castling === 'K' || move.castling === 'k') return 'O-O';
      if (move.castling === 'Q' || move.castling === 'q') return 'O-O-O';

      const p = board[move.to] !== EMPTY ? board[move.to] : (move.enPassant ? (turn | PAWN) : EMPTY);
      // Note: after makeMove, board[move.to] has the moved piece. Before makeMove, we need the original.
      // This function is called BEFORE makeMove in doMove, so board[move.from] is still the piece.
      const piece = board[move.from];
      const type = pieceType(piece);
      const isCapture = board[move.to] !== EMPTY || move.enPassant;
      const promoChars = { [QUEEN]: 'Q', [ROOK]: 'R', [BISHOP]: 'B', [KNIGHT]: 'N' };

      let s = '';

      if (type === PAWN) {
        if (isCapture) {
          s += FILES[sqFile(move.from)] + 'x';
        }
        s += sqName(move.to);
        if (move.promotion) {
          s += '=' + promoChars[move.promotion];
        }
      } else {
        const pieceChars = { [KNIGHT]: 'N', [BISHOP]: 'B', [ROOK]: 'R', [QUEEN]: 'Q', [KING]: 'K' };
        s += pieceChars[type];

        // Disambiguation: check if another piece of same type can reach same square
        const legal = legalMoves();
        const ambiguous = legal.filter(m =>
          m.to === move.to && m.from !== move.from && !m.castling &&
          pieceType(board[m.from]) === type
        );
        if (ambiguous.length > 0) {
          const sameFile = ambiguous.some(m => sqFile(m.from) === sqFile(move.from));
          const sameRank = ambiguous.some(m => sqRank(m.from) === sqRank(move.from));
          if (!sameFile) {
            s += FILES[sqFile(move.from)];
          } else if (!sameRank) {
            s += RANKS[sqRank(move.from)];
          } else {
            s += sqName(move.from);
          }
        }

        if (isCapture) s += 'x';
        s += sqName(move.to);
      }

      return s;
    }

    // Execute a user move, returns { notation, move } or null if illegal
    function doMove(input) {
      const move = parseMove(input);
      if (!move) return null;
      const notation = moveToNotation(move);
      const undo = makeMove(move);
      history.push({ move, undo, notation });

      // Add check/checkmate indicators
      let suffix = '';
      const legal = legalMoves();
      if (inCheck(turn)) {
        suffix = legal.length === 0 ? '#' : '+';
      }

      return { notation: notation + suffix, move };
    }

    function getStatus() {
      const legal = legalMoves();
      const check = inCheck(turn);
      if (legal.length === 0) {
        if (check) return turn === WHITE ? 'black_wins' : 'white_wins';
        return 'stalemate';
      }
      if (halfMoves >= 100) return 'draw_50';
      return 'playing';
    }

    function getTurn() { return turn; }
    function getBoard() { return board; }
    function getHistory() { return history; }
    function getLegalMoves() { return legalMoves(); }
    function getEnPassant() { return enPassant; }
    function getCastling() { return castling; }
    function getFullMoves() { return fullMoves; }

    // For engine: expose internals
    function getMakeMoveFunc() { return makeMove; }
    function getUndoMoveFunc() { return undoMove; }

    reset();

    return {
      reset, doMove, getStatus, getTurn, getBoard, getHistory, getLegalMoves,
      legalMoves, makeMove, undoMove, moveToNotation, inCheck, findKing,
      getEnPassant, getCastling, getFullMoves,
      isAttacked, sqName, nameToSq, sqRank, sqFile, isValid, pieceType, pieceColor,
      EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK,
      PIECE_CHARS,
    };
  }

  return { createGame };
})();

if (typeof module !== 'undefined') module.exports = Chess;
