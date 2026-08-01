const fs = require('fs');
const path = require('path');

const providerName = process.argv[2];

if (!providerName) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: Please specify a provider name.');
  console.log('Usage: npm run generate:provider <ProviderName>');
  process.exit(1);
}

const yamlPath = path.join(__dirname, '..', 'src', 'providers', 'yaml', `${providerName.toLowerCase()}.yml`);

if (fs.existsSync(yamlPath)) {
  console.error('\x1b[31m%s\x1b[0m', `Error: Provider ${providerName} already exists.`);
  process.exit(1);
}

const template = `name: "${providerName}"
baseUrl: "https://example.com"
defaultCategory: "football"
selectors:
  matches: ".match-list .item"
  title: "h4.title"
  time: "span.time"
  link: "a.play -> href"
`;

fs.writeFileSync(yamlPath, template);

console.log('\x1b[32m%s\x1b[0m', '✅ Provider scaffolded successfully!');
console.log(`File created at: src/providers/yaml/${providerName.toLowerCase()}.yml`);
console.log('Open the file and update the CSS selectors to match the target website.');
