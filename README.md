# Unidos em Um — Carteirinha Digital

Portal responsivo de membros com autenticação Firebase, perfil pessoal, foto e carteirinha exportável em PDF.

## Funcionalidades
- Login e criação de conta por e-mail/senha.
- Painel privado com cartão de membro.
- Edição de foto, nome, CPF, RG, nome de afiliação e cargo.
- Perfil salvo no Realtime Database em `members/{uid}`.
- Foto no Firebase Storage em `member-photos/{uid}/profile`.
- Download da carteirinha em PDF com o visual do cartão.\n- Biblioteca de documentos PDF e imagens para membros aprovados.\n- Gestão administrativa de carteirinhas: edição, criação de cadastro presencial e criação de conta Firebase.
- Layout adaptado para celular e computador.

## Configuração Firebase (obrigatória)
1. Authentication → Sign-in method: habilite **E-mail/senha**.
2. Realtime Database → Regras: publique o conteúdo de `database.rules.json`.
3. Firebase Storage: ative/crie o bucket do projeto; em Rules, publique `storage.rules`.\n4. Realtime Database: publique também as regras atualizadas para `documents` em `database.rules.json`.
5. Confirme em `assets/js/firebase.js` se o bucket corresponde ao exibido no console Firebase.
5. Para cadastro aberto, mantenha habilitada a criação de usuários por e-mail/senha. Se somente a secretaria cadastrar membros, remova o formulário de criação de conta e crie os usuários pelo Firebase Authentication.

## Documentos e integrações\n- Editores e administradores publicam documentos pela página `documentos.html`; membros aprovados têm leitura.\n- O upload usa o Apps Script em `google-drive/Code.gs`. Após atualizar o script, publique uma nova versão do Aplicativo da Web. A pasta do Drive precisa conceder acesso de leitura aos arquivos por link para que os membros consigam abri-los.\n- O perfil guarda o telefone e a preferência de avisos do WhatsApp. O envio automático e a conexão por QR Code ainda dependem de um serviço de mensagens persistente; não estão ativos nesta versão.\n\n## Segurança
CPF e RG são dados pessoais. As regras fornecidas permitem que cada usuário leia e altere somente o próprio registro e sua própria foto. Não publique regras abertas de leitura ou gravação. Esta primeira versão não inclui painel administrativo para a secretaria consultar todos os membros.

## Publicação
Site estático: publique a raiz do repositório em hospedagem estática ou servidor web. O PDF usa jsPDF via CDN e precisa de conexão com a internet.
