# Punto U

Prototipo móvil de movilidad universitaria con solicitud de carros y vans, planes, pago, seguimiento del viaje y chat contextual con el conductor.

## Ejecutar

Requiere Node.js 20 o superior.

```bash
copy .env.example .env
npm start
```

Después abre `http://localhost:3000`.

El chat siempre ofrece respuestas locales relacionadas con el viaje. Para activar respuestas generadas con IA, agrega `OPENAI_API_KEY` al archivo `.env` y, opcionalmente, cambia `OPENAI_MODEL`. La clave nunca debe incluirse en `index.html` ni publicarse en el repositorio.
