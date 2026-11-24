# Unidos em Um — Carteirinha Digital

Portal responsivo de membros com autenticação Firebase, perfil pessoal, foto e carteirinha exportável em PDF.

## Funcionalidades
- Login e criação de conta por e-mail/senha.
- Painel privado com cartão de membro.
- Edição de foto, nome, CPF, RG, nome de afiliação e cargo.
- Perfil salvo no Realtime Database em `members/{uid}`.
- Foto no Firebase Storage em `member-photos/{uid}/profile`.
- Download da carteirinha em PDF com o visual do cartão.
- Biblioteca de documentos PDF e imagens para membros aprovados.
- Gestão administrativa de carteirinhas: edição, criação de cadastro presencial e criação de conta Firebase.
- Layout adaptado para celular e computador.

## Configuração Firebase (obrigatória)
1. Authentication → Sign-in method: habilite **E-mail/senha**.
2. Realtime Database → Regras: publique o conteúdo atualizado de `database.rules.json`, incluindo `members`, `events` e `documents`.
3. Firebase Storage: ative/crie o bucket do projeto; em Rules, publique `storage.rules`.
4. Confirme em `assets/js/firebase.js` se o bucket corresponde ao exibido no console Firebase.
5. Para cadastro aberto, mantenha habilitada a criação de usuários por e-mail/senha. Se somente a secretaria cadastrar membros, remova o formulário de criação de conta e crie os usuários pelo Firebase Authentication.

## Documentos e integrações
- A conta administradora autorizada publica documentos pela página `documentos.html`; o upload de PDF/imagem usa Firebase Storage com envio retomável e indicador de progresso (até 15 MB).
- Após atualizar `storage.rules`, publique as regras em Firebase Console → Storage → Rules. A regra atual limita a publicação à conta `danielparuccikk@gmail.com`; os arquivos ficam disponíveis para usuários autenticados.
- A foto da carteirinha é otimizada e incorporada ao perfil como imagem JPEG reduzida, permitindo que o PDF exportado inclua a foto sem depender do CORS do Google Drive. Se a foto já estava cadastrada antes desta atualização, selecione-a novamente uma vez em Configurações e salve para gerar a versão incorporada.
- A aba `whatsapp.html` é restrita à conta `danielparuccikk@gmail.com`. O serviço `whatsapp-service/` gera QR Code e mantém a conexão em armazenamento temporário do Render; após reinícios ou suspensão pode ser necessário reconectar. A biblioteca Baileys é uma integração não oficial do WhatsApp Web; o envio automático de avisos ainda não foi ativado.

## Segurança
CPF e RG são dados pessoais. As regras fornecidas permitem que cada usuário leia e altere somente o próprio registro e sua própria foto. Não publique regras abertas de leitura ou gravação. Esta primeira versão não inclui painel administrativo para a secretaria consultar todos os membros.

## Publicação
Site estático: publique a raiz do repositório em hospedagem estática ou servidor web. O PDF usa jsPDF via CDN e precisa de conexão com a internet.
