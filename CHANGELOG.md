# Histórico de versões

## [1.0.0] - 2026-10-22

- Dashboard de temperatura e umidade integrado à planilha do ESP32.
- API Flask/WSGI com Gunicorn e configuração de produção no Render.
- Gráficos interativos, filtros, histórico e exportação CSV.
- Tema claro/escuro e preferências locais.
- Padronização da marca para IoT.
- Versão exposta no painel, na API de saúde e no cabeçalho HTTP.
- Guia de autenticação, upload para GitHub e implantação no Render.
- Testes automáticos no GitHub Actions e deploy após aprovação dos checks.

## Como registrar uma versão

Atualize `VERSION`, descreva as mudanças neste arquivo, faça um commit e crie uma tag anotada `vX.Y.Z`. Use PATCH para correções compatíveis, MINOR para novas funcionalidades compatíveis e MAJOR para mudanças incompatíveis. Publique a tag junto dos commits.
