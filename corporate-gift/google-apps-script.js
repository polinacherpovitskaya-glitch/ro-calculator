/**
 * Google Apps Script — paste this into script.google.com
 * Attached to a Google Sheet.
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this code
 * 4. Deploy → New deployment → Web app (or update existing)
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the URL → paste into config.json "googleScriptUrl"
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  // Add header row if sheet is empty
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Дата', 'Слово', 'Буквы и цвета', 'Rainbow?',
      'Цвет шнура', 'Цвет карабина', 'Кол-во букв',
      'ФИО', 'Телефон', 'Город', 'Адрес', 'Комментарий',
      'Превью подвеса'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    // Set column widths for readability
    sheet.setColumnWidth(13, 300); // Preview column wider
  }

  // Save pendant image to Google Drive if provided
  var imageUrl = '';
  if (data.pendantImage && data.pendantImage.indexOf('data:image') === 0) {
    try {
      var base64 = data.pendantImage.replace(/^data:image\/\w+;base64,/, '');
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png',
        'pendant_' + data.word + '_' + new Date().getTime() + '.png');

      // Save to a folder (create if needed)
      var folderName = 'RO Pendant Orders';
      var folders = DriveApp.getFoldersByName(folderName);
      var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = file.getUrl();
    } catch (err) {
      imageUrl = 'Ошибка сохранения: ' + err.message;
    }
  }

  sheet.appendRow([
    data.date,
    data.word,
    data.lettersDetail,
    data.isRainbow || 'Нет',
    data.cordColor,
    data.carabinerColor,
    data.letterCount,
    data.fullName,
    data.phone,
    data.city,
    data.address,
    data.comment || '—',
    imageUrl
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
