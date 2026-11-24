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
- Gestão administrativa de carteirinhas e cadastros.
- Layout adaptado para celular e computador.

## Configuração Firebase
1. Authentication → Sign-in method: habilite **E-mail/senha**.
2. Realtime Database → Regras: publique `database.rules.json`, incluindo `members`, `events` e `documents`.
3. O Firebase Storage continua sendo usado para recursos que já dependem dele, como fotos quando aplicável. A biblioteca de documentos usa Google Drive.
4. Confirme em `assets/js/firebase.js` as configurações do projeto.

## Documentos e Google Drive
- A página `documentos.html` envia PDFs e imagens diretamente ao Google Drive por meio do Apps Script, com limite de 15 MB.
- Os metadados e links ficam no Realtime Database em `documents`.
- A pasta exclusiva de documentos é `1cJl0T85pWo26wAJ_3ajwb4DU8lzAwxHO`; a pasta de fotos dos membros permanece separada.
- No Google Drive, compartilhe a pasta de documentos como **Qualquer pessoa com o link — Leitor** para permitir que membros aprovados abram os arquivos.
- Para ativar: copie o conteúdo atualizado de `google-drive/Code.gs` para o projeto Apps Script, execute `authorizeDriveAccess()` e publique uma nova versão do Aplicativo da Web.
- Mantenha as propriedades `FIREBASE_API_KEY` e `DRIVE_FOLDER_ID` existentes no Apps Script. O ID da pasta de documentos já está configurado como fallback em `DRIVE_DOCUMENTS_FOLDER_ID`.

## Foto e carteirinha
A foto da carteirinha é otimizada e incorporada ao perfil como imagem JPEG reduzida, permitindo que o PDF exportado inclua a foto sem depender do CORS do Google Drive.

## WhatsApp
A aba `whatsapp.html` é restrita à conta autorizada. O serviço `whatsapp-service/` gera QR Code e mantém a conexão em armazenamento temporário do Render; após reinícios ou suspensão pode ser necessário reconectar. Baileys é uma integração não oficial do WhatsApp Web. O envio automático de avisos ainda depende da implementação e configuração do serviço.

## Segurança
CPF e RG são dados pessoais. Não publique regras abertas de leitura ou gravação no Firebase. Acesso a documentos deve ser controlado pela autenticação e pelas permissões do portal; a pasta compartilhada contém somente documentos destinados aos membros.
