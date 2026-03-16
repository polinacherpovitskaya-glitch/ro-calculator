/**
 * Google Apps Script — paste this into script.google.com
 * Attached to a Google Sheet.
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this code
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the URL → paste into config.json "googleScriptUrl"
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  // Add header row if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Дата', 'Слово', 'Буквы и цвета', 'Цвет шнура',
      'Цвет карабина', 'Кол-во букв', 'ФИО', 'Телефон',
      'Башня', 'Этаж', 'Отдел'
    ]);
    // Bold header
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }

  sheet.appendRow([
    data.date,
    data.word,
    data.lettersDetail,
    data.cordColor,
    data.carabinerColor,
    data.letterCount,
    data.fullName,
    data.phone,
    data.building,
    data.floor,
    data.department
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService
    .createTextOutput('Corporate Gift Order API is running')
    .setMimeType(ContentService.MimeType.TEXT);
}
