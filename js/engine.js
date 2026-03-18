// engine.js - Chess AI with Minimax + Alpha-Beta Pruning

const ChessEngine = (() => {
  // Piece values
  const PIECE_VALUE = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 20000 };
  // PAWN=1, KNIGHT=2, BISHOP=3, ROOK=4, QUEEN=5, KING=6

  // Piece-Square Tables (from white's perspective, flipped for black)
  const PST = {
    // Pawn
    1: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    // Knight
    2: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    // Bishop
    3: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    // Rook
    4: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    // Queen
    5: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    // King (middlegame)
    6: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  function getPstIndex(sq, color, game) {
    const file = game.sqFile(sq);
    const rank = game.sqRank(sq);
    // PST is from white's perspective (rank 7 = top for white)
    if (color === game.WHITE) {
      return (7 - rank) * 8 + file;
    } else {
      return rank * 8 + file;
    }
  }

  function evaluate(game) {
    const board = game.getBoard();
    let score = 0;

    for (let sq = 0; sq < 128; sq++) {
      if (!game.isValid(sq)) continue;
      const p = board[sq];
      if (p === game.EMPTY) continue;

      const type = game.pieceType(p);
      const color = game.pieceColor(p);
      const value = PIECE_VALUE[type] + (PST[type]?.[getPstIndex(sq, color, game)] || 0);

      if (color === game.WHITE) {
        score += value;
      } else {
        score -= value;
      }
    }

    // Bonus for mobility
    const currentTurn = game.getTurn();
    const legalCount = game.legalMoves().length;
    if (currentTurn === game.WHITE) score += legalCount * 2;
    else score -= legalCount * 2;

    return score;
  }

  // Move ordering for better alpha-beta pruning
  function orderMoves(moves, game) {
    const board = game.getBoard();
    return moves.sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      // Captures first (MVV-LVA)
      if (board[a.to] !== game.EMPTY) {
        scoreA += 10 * PIECE_VALUE[game.pieceType(board[a.to])] - PIECE_VALUE[game.pieceType(board[a.from])];
      }
      if (board[b.to] !== game.EMPTY) {
        scoreB += 10 * PIECE_VALUE[game.pieceType(board[b.to])] - PIECE_VALUE[game.pieceType(board[b.from])];
      }
      // Promotions
      if (a.promotion) scoreA += PIECE_VALUE[a.promotion];
      if (b.promotion) scoreB += PIECE_VALUE[b.promotion];
      return scoreB - scoreA;
    });
  }

  function minimax(game, depth, alpha, beta, maximizing) {
    const status = game.getStatus();
    if (status === 'white_wins') return -99999 - depth;
    if (status === 'black_wins') return 99999 + depth;
    if (status === 'stalemate' || status === 'draw_50') return 0;
    if (depth === 0) return evaluate(game);

    let moves = game.legalMoves();
    moves = orderMoves(moves, game);

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const undo = game.makeMove(move);
        const score = minimax(game, depth - 1, alpha, beta, false);
        game.undoMove(undo);
        maxEval = Math.max(maxEval, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const undo = game.makeMove(move);
        const score = minimax(game, depth - 1, alpha, beta, true);
        game.undoMove(undo);
        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function findBestMove(game, depth = 4) {
    const moves = game.legalMoves();
    if (moves.length === 0) return null;

    // For first few moves, use depth 3 (faster opening)
    const moveCount = game.getHistory().length;
    if (moveCount < 4) depth = 3;

    const isWhite = game.getTurn() === game.WHITE;
    let bestMove = moves[0];
    let bestScore = isWhite ? -Infinity : Infinity;

    const orderedMoves = orderMoves([...moves], game);

    for (const move of orderedMoves) {
      const undo = game.makeMove(move);
      const score = minimax(game, depth - 1, -Infinity, Infinity, !isWhite);
      game.undoMove(undo);

      if (isWhite ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  return { findBestMove, evaluate };
})();

if (typeof module !== 'undefined') module.exports = ChessEngine;
