/**
 * src/middleware/rateLimit.js
 * ---------------------------------------------------------------------
 * Limitador simples de tentativas, em memória, por IP.
 * Usado no login/cadastro para dificultar ataques de força bruta.
 *
 * Limitação consciente: o contador vive na memória do processo, então
 * zera quando o servidor reinicia e não é compartilhado entre várias
 * instâncias. Em produção real, usar um pacote como "express-rate-limit"
 * com um store compartilhado (ex.: Redis).
 * --------------------------------------------------------------------- */

export function criarRateLimit({ maxTentativas = 10, janelaMs = 15 * 60 * 1000 } = {}) {
  const tentativas = new Map(); // ip -> { contagem, expiraEm }

  // Limpeza periódica para o Map não crescer indefinidamente.
  setInterval(() => {
    const agora = Date.now();
    for (const [ip, registro] of tentativas) {
      if (registro.expiraEm <= agora) tentativas.delete(ip);
    }
  }, janelaMs).unref(); // unref: este timer não impede o processo de encerrar

  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
    const agora = Date.now();

    let registro = tentativas.get(ip);
    if (!registro || registro.expiraEm <= agora) {
      registro = { contagem: 0, expiraEm: agora + janelaMs };
      tentativas.set(ip, registro);
    }

    registro.contagem += 1;

    if (registro.contagem > maxTentativas) {
      const segundos = Math.ceil((registro.expiraEm - agora) / 1000);
      res.set('Retry-After', String(segundos));
      return res.status(429).json({
        erro: `Muitas tentativas. Tente novamente em ${Math.ceil(segundos / 60)} minuto(s).`,
      });
    }

    next();
  };
}
