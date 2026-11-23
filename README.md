# Unidos em Um — Carteirinha Digital

Portal responsivo de membros com autenticação Firebase, perfil pessoal, foto e carteirinha exportável em PDF.

## Funcionalidades
- Login e criação de conta por e-mail/senha.
- Painel privado com cartão de membro.
- Edição de foto, nome, CPF, RG, nome de afiliação e cargo.
- Perfil salvo no Realtime Database em `members/{uid}`.
- Foto no Firebase Storage em `member-photos/{uid}/profile`.
- Download da carteirinha em PDF.
- Layout adaptado para celular e computador.

## Configuração Firebase (obrigatória)
1. Authentication → Sign-in method: habilite **E-mail/senha**.
2. Realtime Database → Regras: publique o conteúdo de `database.rules.json`.
3. Firebase Storage: ative/crie o bucket do projeto; em Rules, publique `storage.rules`.
4. Confirme em `assets/js/firebase.js` se o bucket corresponde ao exibido no console Firebase.
5. Para cadastro aberto, mantenha habilitada a criação de usuários por e-mail/senha. Se somente a secretaria cadastrar membros, remova o formulário de criação de conta e crie os usuários pelo Firebase Authentication.

## Segurança
CPF e RG são dados pessoais. As regras fornecidas permitem que cada usuário leia e altere somente o próprio registro e sua própria foto. Não publique regras abertas de leitura ou gravação. Esta primeira versão não inclui painel administrativo para a secretaria consultar todos os membros.

## Publicação
Site estático: publique a raiz do repositório em hospedagem estática ou servidor web. O PDF usa jsPDF via CDN e precisa de conexão com a internet.
