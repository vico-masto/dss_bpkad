const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, '../src');

const replacements = [
  // bg-indigo-600 -> bg-ds-primary
  { regex: /bg-indigo-600/g, replacement: "bg-ds-primary" },
  { regex: /hover:bg-indigo-700/g, replacement: "hover:bg-ds-primary-hover" },
  { regex: /text-indigo-600/g, replacement: "text-fin-info-text" },
  { regex: /border-indigo-600/g, replacement: "border-ds-focus-ring" },
  { regex: /shadow-indigo-600\/20/g, replacement: "shadow-ds-primary/20" },
  { regex: /shadow-indigo-500\/20/g, replacement: "shadow-ds-primary/20" },
  { regex: /shadow-indigo-900\/20/g, replacement: "shadow-ds-primary/20" },
  { regex: /shadow-indigo-100/g, replacement: "shadow-ds-primary/10" },
  { regex: /bg-indigo-600\/10/g, replacement: "bg-ds-primary/10" },
  { regex: /bg-indigo-600\/20/g, replacement: "bg-ds-primary/20" },
  { regex: /bg-indigo-600\/5/g, replacement: "bg-ds-primary/5" },
  
  // #101828 -> fin-text-primary
  { regex: /bg-\[\#101828\]/g, replacement: "bg-ds-primary" },
  { regex: /text-\[\#101828\]/g, replacement: "text-fin-text-primary" },
  { regex: /border-\[\#101828\]/g, replacement: "border-fin-text-primary" },
  
  // #475467 -> fin-text-secondary
  { regex: /bg-\[\#475467\]/g, replacement: "bg-fin-text-secondary" },
  { regex: /text-\[\#475467\]/g, replacement: "text-fin-text-secondary" },
  
  // #98A2B3 -> fin-text-muted
  { regex: /bg-\[\#98A2B3\]/g, replacement: "bg-fin-text-muted" },
  { regex: /text-\[\#98A2B3\]/g, replacement: "text-fin-text-muted" },
  
  // #F8F9FA -> fin-page
  { regex: /bg-\[\#F8F9FA\]/g, replacement: "bg-fin-page" },
  
  // #F2F4F7 -> fin-subtle
  { regex: /bg-\[\#F2F4F7\]/g, replacement: "bg-fin-subtle" },
  
  // #E9ECEF -> fin-border
  { regex: /border-\[\#E9ECEF\]/g, replacement: "border-fin-border" },
  
  // #D0D5DD -> fin-border-strong
  { regex: /border-\[\#D0D5DD\]/g, replacement: "border-fin-border-strong" },
  
  // #1D2939 -> ds-primary-hover
  { regex: /bg-\[\#1D2939\]/g, replacement: "bg-ds-primary-hover" },
  { regex: /hover:bg-\[\#1D2939\]/g, replacement: "hover:bg-ds-primary-hover" }
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  let totalReplaced = 0;
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      totalReplaced += processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      let fileReplaced = 0;
      
      replacements.forEach(rule => {
        const matches = content.match(rule.regex);
        if (matches) {
          fileReplaced += matches.length;
          content = content.replace(rule.regex, rule.replacement);
        }
      });
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        totalReplaced += fileReplaced;
        console.log(`Updated ${fullPath} (${fileReplaced} replacements)`);
      }
    }
  });
  
  return totalReplaced;
}

const total = processDirectory(directory);
console.log(`Total replacements made: ${total}`);
