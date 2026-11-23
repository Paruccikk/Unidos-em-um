# Integração de fotos com Google Drive

O Apps Script valida o token do Firebase Authentication e confirma que o perfil é aprovado antes de gravar a foto. O envio usa um formulário em iframe para evitar bloqueio CORS do navegador.

## Configuração
1. Acesse https://script.google.com/ e crie um projeto.
2. Cole o conteúdo de `Code.gs`.
3. Em **Configurações do projeto → Propriedades do script**, crie:
   - `FIREBASE_API_KEY`: valor de `apiKey` em `assets/js/firebase.js`.
   - `DRIVE_FOLDER_ID`: `1uusq1brL2Nbmmau0sp9IvMLUS6TR_F5f`.
4. **Implantar → Nova implantação → Aplicativo da Web**.
5. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
6. Autorize as permissões solicitadas.
7. Copie a URL terminada em `/exec` e cole em `DRIVE_UPLOAD_URL` no arquivo `assets/js/painel.js`.
8. Publique a atualização do site.

## Privacidade
Para a foto aparecer na carteirinha sem login Google adicional, cada arquivo fica com acesso “qualquer pessoa com o link pode visualizar”. Quem obtiver o link poderá ver a imagem. A pasta não é compartilhada publicamente e os demais dados continuam protegidos no Realtime Database.
