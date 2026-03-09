# AnKing Dashboard Pro v5

Site estático pronto para GitHub Pages.

## Recursos incluídos
- Dashboard completo
- Heatmap de estudo
- Meta diária
- Tempo total, por deck e por sessão
- Fila tipo Anki: new / learning / review / due
- Algoritmo SM-2 simplificado
- Menu Matérias com títulos iguais ao menu do deck
- Estudo por:
  - mistura adaptativa
  - due do dia
  - todos os cards
  - quantidade limitada
  - somente erradas ativas
  - somente acertadas
  - revisados hoje
  - somente novos
  - somente learning
  - somente review
  - seleção manual
- Ordem randomizada ou sequencial
- Busca com filtros
- Importação de decks por JSON ou CSV
- Exclusão de decks adicionados
- Deck original protegido
- Exportação de backup

## Mistura adaptativa sugerida
- Retenção < 50%: 65% de cards errados ativos + 35% novos/due
- Retenção entre 50% e 69%: 45% errados + 55% novos/due
- Retenção >= 70%: 25% errados + 75% novos/due

Quando um card entra em "erradas ativas":
- ao responder Again, ele entra na fila de erradas
- ao responder Hard/Good/Easy depois, ele sai automaticamente dessa fila

## Como publicar
1. Envie `index.html`, `styles.css`, `app.js` e `base_cards.json` para o repositório.
2. Em Settings > Pages, publique a branch `main`.

## Formato para importar JSON
[
  {
    "deck": "Cardiologia::ECG",
    "front": "Pergunta",
    "back": "Resposta"
  }
]

## Formato para importar CSV
Colunas:
- deck
- front
- back
