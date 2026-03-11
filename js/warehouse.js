// =============================================
// Recycle Object — Warehouse (Inventory) Page
// =============================================

// =============================================
// SEED DATA (from "Инвентаризация Фурнитуры" Excel)
// Auto-loaded on first visit if warehouse is empty
// =============================================

const WAREHOUSE_SEED_DATA = [
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-VT","size":"3 см","color":"фиолетовый","qty":30,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-PK","size":"3 см","color":"розовый","qty":80,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-GR","size":"3 см","color":"зеленый","qty":140,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-WH","size":"3 см","color":"белый","qty":300,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-LBL","size":"3 см","color":"голубой","price_per_unit":5},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-OR","size":"3 см","color":"оранжевый","qty":30,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-BK","size":"3 см","color":"черный","qty":120,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-BL","size":"3 см","color":"синий","price_per_unit":5},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-030-YL","size":"3 см","color":"желтый","qty":80,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-RD","size":"2 см","color":"красный","qty":360,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-OR","size":"2 см","color":"оранжевый","qty":200,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-LBL","size":"2 см","color":"голубой","qty":150,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-BL","size":"2 см","color":"синий","qty":200,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-PK","size":"2 см","color":"розовый","qty":14,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-YL","size":"2 см","color":"желтый","qty":350,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-GR","size":"2 см","color":"зеленый","qty":140,"price_per_unit":5.0},
    {"category":"carabiners","name":"Карабин-кольцо","sku":"CR-RNG-020-BLCK","size":"2 см","color":"черный","qty":90,"price_per_unit":5},
    {"category":"carabiners","name":"Карабин овальный","sku":"CR-OVL-050-BK","size":"5 см","color":"черный","qty":75,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин","sku":"CR-STD-050-BK","size":"5 см","color":"черный","qty":270,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин (образцы Т-банк)","sku":"CR-STD-050-BK-TB","size":"5 см","color":"черный","qty":82,"price_per_unit":10},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-RD","size":"5 см","color":"красный","qty":35,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин","sku":"CR-STD-050-RD+","size":"5 см","color":"красный","qty":100,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-OR","size":"5 см","color":"оранжевый","qty":650,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-YL","size":"5 см","color":"желтый","qty":120,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-YL+","size":"5 см","color":"желтый","qty":120,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-GR","size":"5 см","color":"зеленый","price_per_unit":10},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-LGR","size":"5 см","color":"салатовый","qty":30,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-GR+","size":"5 см","color":"зеленый","qty":70,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-LBL+","size":"5 см","color":"голубой","qty":70,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-LBL","size":"5 см","color":"голубой","qty":30,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-PK","size":"5 см","color":"розовый","qty":90,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-PK+","size":"5 см","color":"розовый","qty":5,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-PKB","size":"5 см","color":"яркий розовый","qty":50,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-VT+","size":"5 см","color":"фиолетовый","qty":200,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-BL","size":"5 см","color":"синий","qty":43,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-BL+","size":"5 см","color":"синий","qty":160,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-BV","size":"5 см","color":"синий-фиолетовый","qty":96,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины","sku":"CR-STD-050-PNK2+","size":"5 см","color":"розовый","qty":100,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин с ушком","sku":"CR-STD-BK-H","color":"черный","qty":230,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин с защелкой","sku":"CR-STD-BLCK+","color":"черный","qty":75,"price_per_unit":10.0},
    {"category":"carabiners","name":"Круглый карабин","sku":"CR-RNG-020-SV","size":"2 см","color":"серебряный","qty":90,"price_per_unit":5.0},
    {"category":"carabiners","name":"Круглый карабин","sku":"CR-RNG-023-SV","size":"2,3 см","color":"серебряный","price_per_unit":5},
    {"category":"carabiners","name":"Круглый карабин","sku":"CR-RNG-032-SV","size":"3,2 см","color":"серебряный","qty":25,"price_per_unit":5.0},
    {"category":"carabiners","name":"Круглый карабин","sku":"CR-RNG-039-SV","size":"3,9 см","color":"серебряный","qty":450,"price_per_unit":5.0},
    {"category":"carabiners","name":"Круглый карабин с ушком","sku":"CR-RNG-SV-H","size":"2,3 см","color":"серебряный","qty":880,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин с плоским кольцом","sku":"CR-RNGFLT","color":"серебряный","qty":280,"price_per_unit":13.0},
    {"category":"carabiners","name":"Металлический карабин","sku":"CR-MET-040-SV","size":"4 см","color":"серебряный","qty":90,"price_per_unit":10.0},
    {"category":"carabiners","name":"Металлический карабин","sku":"CR-MET-070-SV","size":"7 см","color":"серебряный","qty":93,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин тонкий (для брелков)","sku":"CR-THN-SV","color":"серебряный","qty":150,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабины с кольцом","sku":"CR-STD-SV-K","color":"серебряный","qty":120,"price_per_unit":15.0},
    {"category":"carabiners","name":"Карабины круглые с кольцом","sku":"CR-RNG-SV-K","color":"серебряный","price_per_unit":15},
    {"category":"carabiners","name":"Карабины с круглым отверстием","sku":"CR-STD-SV","color":"серебряный","qty":1200,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин с ушком","sku":"CR-STD-SV-H","color":"серебряный","qty":850,"price_per_unit":10.0},
    {"category":"carabiners","name":"Карабин с хупом","sku":"CR-HP","color":"серебряный","qty":100,"price_per_unit":10.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-WH","size":"5 см","color":"белые","qty":20,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-GY","size":"5 см","color":"серые","qty":15,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-38-SV","size":"3,8 см","color":"серебристые","qty":400,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-50-SV","size":"5 см","color":"серебристые","qty":1250,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-OR","size":"5 см","color":"оранжевые","qty":330,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-GRL","size":"5 см","color":"зеленые светлые","qty":25,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-GRD","size":"5 см","color":"темно-зеленые","qty":370,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-GR","size":"5 см","color":"зеленый","qty":620,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-GR+","size":"5 см","color":"зеленый (темнее)","qty":180,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-AQ","size":"5 см","color":"морская волна","qty":130,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-TBL","size":"5 см","color":"тиффани","qty":30,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-055-TBD","size":"5 см","color":"светло-голубой","qty":140,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-NV","size":"5 см","color":"темно-синие","price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-BK","size":"5 см","color":"черный","qty":160,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-YL","size":"5 см","color":"желтый","qty":215,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-VL","size":"5 см","color":"фиолетовый","qty":65,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-VLD","size":"5 см","color":"темный фиолетовый","qty":15,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-LBL","size":"5 см","color":"голубой","price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-RD","size":"5 см","color":"красный","qty":30,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-PK","size":"5 см","color":"розовый","price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-PKD","size":"5 см","color":"темный розовый","price_per_unit":5},
    {"category":"cables","name":"Тросы","sku":"TR-050-LPK","size":"5 см","color":"поросячий розовый","qty":200,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-LLY","size":"5 см","color":"сиреневый","qty":15,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-050-LLPK","size":"5 см","color":"светло-розовый","qty":50,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-195-SV","size":"19,5 см","color":"серебряный","qty":11,"price_per_unit":5.0},
    {"category":"cables","name":"Тросы","sku":"TR-65-SV","size":"6,5 см","color":"серебряный","qty":1640,"price_per_unit":5.0},
    {"category":"rings","name":"Кольца плоские","sku":"RNG-FLAT-25-SV","size":"2,5 см","color":"серебряные","qty":950,"price_per_unit":2},
    {"category":"rings","name":"Кольцо","sku":"RNG-20-SV","size":"2 см","color":"серебряные","qty":1050,"price_per_unit":2},
    {"category":"rings","name":"Кольцо","sku":"RNG-35-SV","size":"3,5 см","color":"серебряные","qty":105,"price_per_unit":2},
    {"category":"rings","name":"Кольцо плоское с цепочкой","sku":"RNG-CHN","size":"3,2 см","color":"серебряные","qty":980,"price_per_unit":5.0},
    {"category":"rings","name":"Соед. кольцо тонкое","sku":"RNG-UN-010-SV-TH","size":"10 мм","color":"серебряные","qty":2900,"price_per_unit":2.0},
    {"category":"rings","name":"Соединительное кольцо","sku":"RNG-UN-010-SV","size":"10 мм","color":"серебряные","qty":7200,"price_per_unit":1.0},
    {"category":"rings","name":"Соединительное кольцо","sku":"RNG-UN-008-SV","size":"8 мм","color":"серебряные","qty":3500,"price_per_unit":1.0},
    {"category":"rings","name":"Соединительное кольцо","sku":"RNG-UN-010-BK","size":"10 мм","color":"черный","qty":1600,"price_per_unit":1.0},
    {"category":"rings","name":"Соединительное кольцо","sku":"RNG-UN-008-BK","size":"8 мм","color":"черный","qty":2800,"price_per_unit":1.0},
    {"category":"chains","name":"Цепочки металл","sku":"CH-MTL","size":"2 мм","color":"ненарезанные","price_per_unit":4.0},
    {"category":"chains","name":"Цепочки металл 10см","sku":"CH-MTL-10CM","size":"2 мм, 10 см","qty":1900,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки металл тонкие","sku":"CH-MTL-THIN","size":"1,6 мм","color":"ненарезанные","price_per_unit":4},
    {"category":"chains","name":"Цепочки металл тонкие 10см","sku":"CH-MTLM-10CM","size":"1,6 мм, 10 см","qty":800,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки металл тонкие 15см","sku":"CH-MTL-15CM","size":"1,6 мм, 15 см","qty":280,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки металл моток","sku":"CH-MTL-ROLL","size":"1,6 мм, моток","qty":5,"price_per_unit":4.0},
    {"category":"chains","name":"Крепления для тонких цепочек","sku":"CL-THIN","price_per_unit":4.0},
    {"category":"chains","name":"Цепочки розовые 10см","sku":"CH-PNK-10CM","size":"10 см","color":"розовый","qty":210,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки темно-розовые 10см","sku":"CH-DPR-10CM","size":"10 см","color":"темно-розовый","qty":220,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки желтые 10см","sku":"CH-YLW-10CM","size":"10 см","color":"желтый","qty":270,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки красные 10см","sku":"CH-RED-10CM","size":"10 см","color":"красный","qty":120,"price_per_unit":4.0},
    {"category":"chains","name":"Цепочки черные 10см","sku":"CH-BLK-10CM","size":"10 см","color":"черный","qty":830,"price_per_unit":4.0},
    {"category":"cords","name":"Наконечники для шнуров","sku":"CAP-005","size":"5 мм","color":"метал","qty":2200,"price_per_unit":5.0},
    {"category":"cords","name":"Наконечники для шнуров","sku":"CAP-006","size":"6 мм","color":"метал","qty":1200,"price_per_unit":5.0},
    {"category":"cords","name":"Наконечники матовые","sku":"CAP-005-MT","size":"5 мм","color":"метал","qty":900,"price_per_unit":5.0},
    {"category":"cords","name":"Наконечники матовые","sku":"CAP-006-MT","size":"6 мм","color":"метал","qty":190,"price_per_unit":5.0},
    {"category":"cords","name":"Миланский шнур","sku":"MSN-GR","color":"зеленый","qty":30900,"unit":"см","price_per_unit":70.0},
    {"category":"cords","name":"Миланский шнур","sku":"MSN-BK","color":"черный","qty":2600,"price_per_unit":70.0},
    {"category":"cords","name":"Миланский шнур","sku":"MSN-PK","color":"розовый","qty":1200,"price_per_unit":70.0},
    {"category":"cords","name":"Миланский шнур","sku":"MSN-OR","color":"оранжевый","qty":2600,"price_per_unit":70.0},
    {"category":"cords","name":"Миланский шнур","sku":"MSN-LV","color":"фиолетовый","qty":3800,"price_per_unit":70.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-PK-NN","size":"80 см","color":"розовый","qty":125,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-VT-NN","size":"80 см","color":"фиолетовый","qty":1050,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-LPK-NN","size":"80 см","color":"темно-розовый","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-OR-NN","size":"80 см","color":"оранжевый","qty":222,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-GR-NN-GR","size":"80 см","color":"зеленый","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-BL-NN","size":"80 см","color":"синий","qty":1232,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-YL-NN","size":"80 см","color":"желтый","qty":100,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-YL-NN-YL","size":"80 см","color":"яркий желтый","qty":435,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-LBL-NN","size":"80 см","color":"голубой","qty":35,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-GR-NN-DGR","size":"80 см","color":"зеленый (темный)","price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-RD-NN-RD","size":"80 см","color":"красный","qty":1580,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-BL-NN-LBL","size":"80 см","color":"светло-голубой","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-GR-NN-GR2","size":"80 см","color":"зеленый","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-BCK-NN","size":"80 см","color":"черный","qty":492,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-GRY-NN","size":"80 см","color":"серый","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-SKY-NN","size":"80 см","color":"небесный","qty":42,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-PGY-NN","size":"80 см","color":"поросячий","qty":950,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-FCS-NN","size":"80 см","color":"фуксия","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-PNBG-NN","size":"80 см","color":"розовый беж","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-HNY-NN","size":"80 см","color":"медовый","qty":100,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-WHT-NN","size":"80 см","color":"белый","qty":437,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-SLD-NN","size":"80 см","color":"салатовый","price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-LZR-NN","size":"80 см","color":"лазурный","qty":138,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с черн. наконечниками","sku":"SLS-800-BCK-NNBL","size":"80 см","color":"черный","qty":88,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур кожаный","sku":"LSN-WH","color":"белый","qty":179,"unit":"м","price_per_unit":25.0},
    {"category":"cords","name":"Шнур кожаный","sku":"LSN-BK","color":"черный","qty":79,"price_per_unit":25.0},
    {"category":"cords","name":"Шнур кожаный","sku":"LSN-PNK","color":"розовый","qty":136,"price_per_unit":25.0},
    {"category":"cords","name":"Петля с карабином","sku":"LP-CR","color":"черный + белый","qty":75,"price_per_unit":25.0},
    {"category":"cords","name":"Паракорд розовый 550","sku":"PRKD-PN550","color":"розовый","qty":21,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд фуксия 550","sku":"PRKD-FK550","color":"фуксия","qty":28,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд малиновый 550","sku":"PRKD-RSB550","color":"малиновый","qty":49,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд бирюзовый 550","sku":"PRKD-LZ550","color":"бирюзовый","qty":122,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд с узором","sku":"PRKD-2GLD","color":"золотой + синий","qty":30,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд с узором","sku":"PRKD-2BLCK","color":"графит + черный","qty":41,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд с узором","sku":"PRKD-2VLT","color":"фиолетовый + горчичный","qty":34,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд зеленый неон","sku":"PRKD-NON-LGT-GRN","color":"зеленый неон","qty":46,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-NON-GRN","color":"зеленый","qty":16,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-NON-DRK-GRN","color":"болотный","qty":19,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-NON-GRSS-GRN","color":"зеленый","qty":110,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-NON-BLCK","color":"черный","qty":9,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-NON-ORNG","color":"оранжевый","qty":10,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Шнур","sku":"STRNG-YLL+WHT","color":"желтый + белый","qty":197,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Шнур","sku":"STRNG-BL+WHT","color":"голубой + белый","qty":152,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Шнур","sku":"STRNG-DRBL+WHT","color":"синий + белый","qty":112,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Шнур","sku":"STRNG-ORNG+WHT","color":"оранжевый + белый","qty":226,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Шнур","sku":"STRNG-GRN+WHT","color":"зеленый + белый","qty":471,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд (медуза)","sku":"PRKD-RD","color":"красный","qty":30,"unit":"м","price_per_unit":23.0},
    {"category":"cords","name":"Паракорд","sku":"PRKD-BLCK","color":"черный","qty":233,"unit":"м","price_per_unit":23.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-65x48","size":"6,5x4,8","color":"калька","qty":151,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-58x58","size":"5,8x5,8","color":"калька","price_per_unit":5},
    {"category":"packaging","name":"Конверт","sku":"ENV-95x70","size":"9,5x7","color":"белый","qty":144,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-90x90","size":"9x9","color":"калька","qty":2125,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-100x80","size":"10x8","color":"калька","qty":13,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-130x80","size":"13x8","color":"калька","qty":48,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-150x90","size":"15x9","color":"калька","qty":38,"price_per_unit":5.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-100x100","size":"10x10","color":"калька","qty":1240,"price_per_unit":7.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-130x130","size":"13x13","color":"калька","qty":288,"price_per_unit":8.0},
    {"category":"packaging","name":"Конверт почтовый","sku":"ENV-165x120","size":"16,5x12","color":"калька","qty":28,"price_per_unit":9.0},
    {"category":"packaging","name":"Конверт","sku":"ENV-60x60","size":"6x6","color":"калька","qty":1650,"price_per_unit":5.0},
    {"category":"packaging","name":"Новая упаковка RO","sku":"BOX-TR"},
    {"category":"packaging","name":"Розовая коробка","sku":"BOX-130x80-PK","size":"13x8","color":"розовый","qty":400,"price_per_unit":100.0},
    {"category":"packaging","name":"Розовая коробка","sku":"BOX-150x150-PK","size":"15x15","color":"розовый","qty":53,"price_per_unit":100.0},
    {"category":"packaging","name":"Розовая коробка","sku":"BOX-130x130-PK","size":"13x13","color":"розовый","qty":47,"price_per_unit":100.0},
    {"category":"packaging","name":"Зеркальная коробка","sku":"BOX-MRR","size":"11x11","color":"зеркальная","qty":179,"price_per_unit":150.0},
    {"category":"other","name":"Кисточка","sku":"TSC-LBL","size":"5 см","color":"голубой","price_per_unit":15},
    {"category":"other","name":"Кисточка","sku":"TSC-WH","size":"5 см","color":"белый","price_per_unit":15},
    {"category":"other","name":"Кисточка","sku":"TSC-RD","size":"5 см","color":"красный","price_per_unit":15},
    {"category":"other","name":"Кисточка","sku":"TSC-VT","size":"5 см","color":"фиолетовый","qty":109,"price_per_unit":15.0},
    {"category":"other","name":"Кисточка","sku":"TSC-PK","size":"5 см","color":"розовый","qty":47,"price_per_unit":15.0},
    {"category":"other","name":"Кисточка","sku":"TSC-PKB","size":"5 см","color":"фуксия","qty":101,"price_per_unit":15.0},
    {"category":"other","name":"Кисточка","sku":"TSC-LPK","size":"5 см","color":"светло-розовый","qty":103,"price_per_unit":15.0},
    {"category":"other","name":"Кисточка","sku":"TSC-LGR","size":"5 см","color":"салатовый","qty":31,"price_per_unit":15.0},
    {"category":"other","name":"Зеркало сердце","sku":"MR-HRT","size":"42x36 мм","qty":250,"price_per_unit":26.0},
    {"category":"other","name":"Зеркало круг","sku":"MR-CRL","size":"7 см","qty":430,"price_per_unit":26.0},
    {"category":"other","name":"Зеркало круг (джуфора)","sku":"MR-9CRL","size":"9 см","qty":350,"price_per_unit":26.0},
    {"category":"other","name":"NFC","sku":"NFC","qty":160,"price_per_unit":8.0},
    {"category":"other","name":"Ретрактор","sku":"OP-SVL","color":"серебро","qty":128,"price_per_unit":5.0},
    {"category":"other","name":"Открывашка","sku":"RET-045-SVL","size":"4,5 см","color":"серебро","qty":530,"price_per_unit":7.0},
    {"category":"other","name":"Кисточка","sku":"TSC-BLCK","size":"5 см","color":"черная","qty":28,"price_per_unit":15.0},
    {"category":"other","name":"Кисточка","sku":"TSC-DVT","size":"5 см","color":"темно-фиолетовая","qty":10,"price_per_unit":15.0},
    {"category":"other","name":"Хуп","sku":"HP-010-SVL","size":"1 см","color":"серебро"},
    {"category":"other","name":"Хуп","sku":"HP-020-SVL","size":"2 см","color":"серебро","qty":720},
];

const WAREHOUSE_CATEGORIES = [
    { key: 'carabiners', label: 'Карабины',  icon: '🔗', color: '#dbeafe', textColor: '#1d4ed8' },
    { key: 'cables',     label: 'Тросы',     icon: '⚙',  color: '#fef3c7', textColor: '#92400e' },
    { key: 'rings',      label: 'Кольца',    icon: '⭕', color: '#d1fae5', textColor: '#065f46' },
    { key: 'chains',     label: 'Цепочки',   icon: '⛓',  color: '#e0e7ff', textColor: '#4338ca' },
    { key: 'cords',      label: 'Шнуры',     icon: '🧵', color: '#fce7f3', textColor: '#9d174d' },
    { key: 'packaging',  label: 'Упаковка',  icon: '📦', color: '#f3e8ff', textColor: '#7c3aed' },
    { key: 'other',      label: 'Разное',    icon: '🔹', color: '#f1f5f9', textColor: '#475569' },
];

const Warehouse = {
    allItems: [],
    allReservations: [],
    editingId: null,
    pendingImport: null,
    _pendingThumbnail: null,
    currentView: 'table',
    _viewToken: 0,
    _shipmentsLoadedAt: 0,
    _viewInitialized: false,

    // Shipment state
    allShipments: [],
    editingShipmentId: null,
    shipmentItems: [],
    projectHardwareState: { checks: {} },

    // ==========================================
    // LIFECYCLE
    // ==========================================

    async load() {
        this.allItems = await loadWarehouseItems();

        // Auto-seed on first visit if warehouse is empty
        if (this.allItems.length === 0 && WAREHOUSE_SEED_DATA.length > 0) {
            await this._seedInitialData();
            this.allItems = await loadWarehouseItems();
        }

        // ONE-TIME MIGRATION v3: clear ALL photos — the SKU->photo mapping was wrong.
        // Photos should be added manually by users via the edit form.
        if (!localStorage.getItem('wh_photo_fix_v3')) {
            let cleared = 0;
            this.allItems.forEach(item => {
                if (item.photo_thumbnail || item.photo_url) {
                    item.photo_thumbnail = '';
                    item.photo_url = '';
                    cleared++;
                }
            });
            if (cleared > 0) {
                await saveWarehouseItems(this.allItems);
                console.log(`[Warehouse] Cleared ${cleared} photos (v3 — full reset)`);
            }
            localStorage.setItem('wh_photo_fix_v3', '1');
        }

        // ONE-TIME MIGRATION v4: apply CORRECT photos from verified spreadsheet data.
        // WAREHOUSE_SEED_PHOTOS_BY_SKU now contains the right SKU→photo mapping.
        if (!localStorage.getItem('wh_photo_fix_v4')) {
            let applied = 0;
            this.allItems.forEach(item => {
                const photo = (typeof WAREHOUSE_SEED_PHOTOS_BY_SKU !== 'undefined')
                    ? WAREHOUSE_SEED_PHOTOS_BY_SKU[item.sku]
                    : null;
                if (photo && !item.photo_thumbnail) {
                    item.photo_thumbnail = photo;
                    applied++;
                }
            });
            if (applied > 0) {
                await saveWarehouseItems(this.allItems);
                console.log(`[Warehouse] Applied ${applied} correct photos (v4)`);
            }
            localStorage.setItem('wh_photo_fix_v4', '1');
        }

        // Migrate: patch prices from WAREHOUSE_SEED_DATA if items have price_per_unit = 0
        {
            let pricedCount = 0;
            this.allItems.forEach(item => {
                if (!item.price_per_unit || item.price_per_unit === 0) {
                    const seed = WAREHOUSE_SEED_DATA.find(s => s.sku === item.sku);
                    if (seed && seed.price_per_unit > 0) {
                        item.price_per_unit = seed.price_per_unit;
                        pricedCount++;
                    }
                }
            });
            if (pricedCount > 0) {
                await saveWarehouseItems(this.allItems);
                console.log(`[Warehouse] Patched ${pricedCount} items with seed prices`);
            }
        }

        // Cleanup: remove exact duplicate rows with zero qty
        if (this._cleanupZeroDuplicateItems()) {
            await saveWarehouseItems(this.allItems);
            console.log('[Warehouse] Removed zero-qty duplicate items');
        }

        this.allReservations = await loadWarehouseReservations();
        this.projectHardwareState = await loadProjectHardwareState();
        if (!this.projectHardwareState || typeof this.projectHardwareState !== 'object') {
            this.projectHardwareState = { checks: {} };
        }
        if (!this.projectHardwareState.checks || typeof this.projectHardwareState.checks !== 'object') {
            this.projectHardwareState.checks = {};
        }
        this.recalcReservations();
        this.populateCategoryFilter();
        this.renderStats();
        this.setView(this.currentView || 'table');
    },

    async _seedInitialData() {
        const now = Date.now();
        const items = WAREHOUSE_SEED_DATA.map((raw, i) => ({
            id: now + i,
            category: raw.category || 'other',
            name: raw.name || '',
            sku: raw.sku || '',
            size: raw.size || '',
            color: raw.color || '',
            unit: raw.unit || 'шт',
            photo_url: '',
            photo_thumbnail: (typeof WAREHOUSE_SEED_PHOTOS_BY_SKU !== 'undefined' && WAREHOUSE_SEED_PHOTOS_BY_SKU[raw.sku]) ? WAREHOUSE_SEED_PHOTOS_BY_SKU[raw.sku] : '',
            qty: raw.qty || 0,
            min_qty: 10,
            price_per_unit: 0,
            notes: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));

        await saveWarehouseItems(items);

        // Record in history
        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now() + 99999,
            item_id: 0,
            item_name: `Начальная загрузка (${items.length} позиций)`,
            item_sku: '',
            type: 'import',
            qty_change: items.reduce((s, i) => s + (i.qty || 0), 0),
            qty_before: 0,
            qty_after: 0,
            order_name: '',
            notes: `Импорт из Excel «Инвентаризация Фурнитуры» — ${items.length} позиций`,
            created_at: new Date().toISOString(),
            created_by: 'система',
        });
        await saveWarehouseHistory(history);

        console.log(`[Warehouse] Seeded ${items.length} items from WAREHOUSE_SEED_DATA`);
    },

    recalcReservations() {
        this.allItems.forEach(item => {
            const activeRes = this.allReservations.filter(
                r => r.item_id === item.id && r.status === 'active'
            );
            item.reserved_qty = activeRes.reduce((s, r) => s + (r.qty || 0), 0);
            item.available_qty = Math.max(0, (item.qty || 0) - item.reserved_qty);
        });
    },

    populateCategoryFilter() {
        const sel = document.getElementById('wh-filter-category');
        if (!sel) return;
        sel.innerHTML = '<option value="">Все категории</option>' +
            WAREHOUSE_CATEGORIES.map(c =>
                `<option value="${c.key}">${c.icon} ${c.label}</option>`
            ).join('');
    },

    // ==========================================
    // STATS
    // ==========================================

    async renderStats() {
        const items = this.allItems;
        const totalItems = items.length;
        const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
        const totalReserved = items.reduce((s, i) => s + (i.reserved_qty || 0), 0);
        const lowStock = items.filter(i => i.min_qty > 0 && i.qty < i.min_qty).length;
        const frozenHardware = items.reduce((s, i) => {
            const qty = Math.max(0, parseFloat(i.qty) || 0);
            const unitCost = Math.max(0, parseFloat(i.price_per_unit) || 0);
            return s + qty * unitCost;
        }, 0);
        const frozenReadyGoods = await this._getReadyGoodsFrozenAmount();
        const frozenTotal = frozenHardware + frozenReadyGoods;

        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('wh-total-items', totalItems);
        el('wh-total-qty', totalQty.toLocaleString('ru-RU'));
        el('wh-total-reserved', totalReserved.toLocaleString('ru-RU'));
        el('wh-low-stock', lowStock);
        el('wh-frozen-total', this._formatMoney(frozenTotal));
        el('wh-frozen-hw', this._formatMoney(frozenHardware));

        // Ready goods stats
        const rg = await loadReadyGoods();
        const rgTotalQty = rg.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const rgFrozen = rg.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.cost_per_unit) || 0), 0);
        el('wh-ready-goods-count', rgTotalQty.toLocaleString('ru-RU'));
        el('wh-frozen-rg', this._formatMoney(rgFrozen));
    },

    // ==========================================
    // FILTERING & RENDERING
    // ==========================================

    filterAndRender() {
        let items = [...this.allItems];

        // Category filter
        const cat = document.getElementById('wh-filter-category');
        if (cat && cat.value) {
            items = items.filter(i => i.category === cat.value);
        }

        // Stock filter
        const stock = document.getElementById('wh-filter-stock');
        if (stock && stock.value) {
            switch (stock.value) {
                case 'in_stock': items = items.filter(i => i.qty > 0); break;
                case 'low': items = items.filter(i => i.min_qty > 0 && i.qty > 0 && i.qty < i.min_qty); break;
                case 'out': items = items.filter(i => i.qty <= 0); break;
                case 'reserved': items = items.filter(i => i.reserved_qty > 0); break;
            }
        }

        // Search
        const search = document.getElementById('wh-search');
        if (search && search.value.trim()) {
            const q = search.value.trim().toLowerCase();
            items = items.filter(i =>
                (i.name || '').toLowerCase().includes(q)
                || (i.sku || '').toLowerCase().includes(q)
                || (i.color || '').toLowerCase().includes(q)
            );
        }

        // Sort
        const sort = document.getElementById('wh-sort');
        const sortVal = sort ? sort.value : 'name';
        switch (sortVal) {
            case 'name': items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')); break;
            case 'qty_desc': items.sort((a, b) => (b.qty || 0) - (a.qty || 0)); break;
            case 'qty_asc': items.sort((a, b) => (a.qty || 0) - (b.qty || 0)); break;
            case 'category': items.sort((a, b) => (a.category || '').localeCompare(b.category || '')); break;
        }

        this.renderTable(items);
    },

    /** Collect unique color values from all warehouse items */
    _getUniqueColors() {
        const colors = new Set();
        (this.allItems || []).forEach(item => {
            if (item.color && item.color.trim()) colors.add(item.color.trim());
        });
        return [...colors].sort((a, b) => a.localeCompare(b, 'ru'));
    },

    renderTable(items) {
        const container = document.getElementById('wh-content');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `<div class="card"><div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>Нет позиций</p>
                <p style="font-size:12px;color:var(--text-muted);">Добавьте вручную или импортируйте из Excel</p>
            </div></div>`;
            return;
        }

        const uniqueColors = this._getUniqueColors();

        const rows = items.map(item => {
            const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category) || WAREHOUSE_CATEGORIES[6];
            const isLow = item.min_qty > 0 && item.qty < item.min_qty;
            const isOut = item.qty <= 0;

            // Photo or placeholder
            const photoSrc = item.photo_thumbnail || item.photo_url;
            const photo = photoSrc
                ? `<img src="${photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)}" class="wh-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="wh-placeholder" style="display:none;background:${cat.color};color:${cat.textColor};">${cat.icon}</span>`
                : `<span class="wh-placeholder" style="background:${cat.color};color:${cat.textColor};">${cat.icon}</span>`;

            // Qty badge class
            const qtyClass = isOut ? 'wh-qty-out' : (isLow ? 'wh-qty-low' : 'wh-qty-ok');

            // Category badge
            const catBadge = `<span class="wh-cat-badge" style="background:${cat.color};color:${cat.textColor};">${cat.label}</span>`;

            // Available qty
            const availInfo = item.reserved_qty > 0
                ? `<span style="font-weight:600;">${item.available_qty}</span>`
                : `<span style="color:var(--text-muted);">—</span>`;

            // Color dropdown options
            const colorOpts = uniqueColors.map(c =>
                `<option value="${this.esc(c)}"${c === (item.color || '') ? ' selected' : ''}>${this.esc(c)}</option>`
            ).join('');

            return `<tr style="${isOut ? 'opacity:0.5;' : (isLow ? 'background:rgba(220,38,38,0.04);' : '')}">
                <td style="width:48px;">${photo}</td>
                <td>
                    <div style="font-weight:600;">${this.esc(item.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${this.esc(item.sku || '')}</div>
                </td>
                <td>${catBadge}</td>
                <td>${this.esc(item.size || '—')}</td>
                <td>
                    <select class="wh-inline-select" onchange="Warehouse.inlineColor(${item.id}, this.value)">
                        <option value="">—</option>
                        ${colorOpts}
                    </select>
                </td>
                <td>
                    <input type="number" class="wh-inline-input text-right" value="${item.price_per_unit || 0}" min="0" step="0.01"
                        onchange="Warehouse.inlinePrice(${item.id}, this.value)">
                </td>
                <td>
                    <input type="number" class="wh-inline-input text-right ${qtyClass}" value="${item.qty || 0}" min="0"
                        onchange="Warehouse.inlineQty(${item.id}, this.value, ${item.qty || 0})">
                </td>
                <td>
                    <input type="number" class="wh-inline-input text-right" value="${item.reserved_qty || 0}" min="0" max="${item.qty || 0}"
                        style="${item.reserved_qty > 0 ? 'color:var(--yellow);font-weight:600;' : ''}"
                        onchange="Warehouse.inlineReserve(${item.id}, this.value, ${item.reserved_qty || 0})">
                </td>
                <td class="text-right">${availInfo}</td>
                <td>
                    <div class="flex gap-4" style="justify-content:flex-end;">
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.editItem(${item.id})" title="Редактировать">✎</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `<div class="card"><div class="table-wrap"><table>
            <thead><tr>
                <th style="width:48px;"></th>
                <th>Название / Артикул</th>
                <th>Категория</th>
                <th>Размер</th>
                <th>Цвет</th>
                <th class="text-right">Цена</th>
                <th class="text-right" style="width:80px;">Кол-во</th>
                <th class="text-right" style="width:70px;">Резерв</th>
                <th class="text-right">Доступно</th>
                <th style="width:50px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div></div>`;
    },

    // ==========================================
    // ADD / EDIT FORM
    // ==========================================

    showAddForm() {
        this.editingId = null;
        this.clearForm();
        document.getElementById('wh-form-title').textContent = 'Новая позиция';
        document.getElementById('wh-delete-btn').style.display = 'none';
        document.getElementById('wh-reservations-section').innerHTML = '';
        document.getElementById('wh-edit-form').style.display = '';
        document.getElementById('wh-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editItem(id) {
        const item = this.allItems.find(i => i.id === id);
        if (!item) return;
        this.editingId = id;
        document.getElementById('wh-form-title').textContent = 'Редактирование';

        document.getElementById('wh-f-category').value = item.category || 'other';
        document.getElementById('wh-f-name').value = item.name || '';
        document.getElementById('wh-f-sku').value = item.sku || '';
        document.getElementById('wh-f-size').value = item.size || '';
        document.getElementById('wh-f-color').value = item.color || '';
        document.getElementById('wh-f-unit').value = item.unit || 'шт';
        document.getElementById('wh-f-photo-url').value = item.photo_url || '';
        document.getElementById('wh-f-qty').value = item.qty || 0;
        document.getElementById('wh-f-min-qty').value = item.min_qty || 0;
        document.getElementById('wh-f-price').value = item.price_per_unit || 0;
        document.getElementById('wh-f-notes').value = item.notes || '';

        // Photo preview
        this._pendingThumbnail = item.photo_thumbnail || null;
        const photoFileInput = document.getElementById('wh-f-photo-file');
        if (photoFileInput) photoFileInput.value = '';
        this.updatePhotoPreview(item.photo_thumbnail || item.photo_url || '');

        document.getElementById('wh-delete-btn').style.display = '';
        this.renderItemReservations(id);
        document.getElementById('wh-edit-form').style.display = '';
        document.getElementById('wh-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideForm() {
        document.getElementById('wh-edit-form').style.display = 'none';
    },

    clearForm() {
        ['wh-f-name', 'wh-f-sku', 'wh-f-size', 'wh-f-color', 'wh-f-photo-url', 'wh-f-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('wh-f-category').value = 'carabiners';
        document.getElementById('wh-f-unit').value = 'шт';
        document.getElementById('wh-f-qty').value = 0;
        document.getElementById('wh-f-min-qty').value = 0;
        document.getElementById('wh-f-price').value = 0;
        // Reset photo
        this._pendingThumbnail = null;
        const photoFileInput = document.getElementById('wh-f-photo-file');
        if (photoFileInput) photoFileInput.value = '';
        const preview = document.getElementById('wh-f-photo-preview');
        if (preview) preview.innerHTML = '<span style="font-size:24px;color:var(--text-muted);">📷</span>';
    },

    async saveItem() {
        const name = document.getElementById('wh-f-name').value.trim();
        if (!name) { App.toast('Укажите название'); return; }

        const item = {
            id: this.editingId || undefined,
            category: document.getElementById('wh-f-category').value,
            name: name,
            sku: document.getElementById('wh-f-sku').value.trim(),
            size: document.getElementById('wh-f-size').value.trim(),
            color: document.getElementById('wh-f-color').value.trim(),
            unit: document.getElementById('wh-f-unit').value || 'шт',
            photo_url: document.getElementById('wh-f-photo-url').value.trim(),
            photo_thumbnail: this._pendingThumbnail || (this.editingId ? (this.allItems.find(i => i.id === this.editingId) || {}).photo_thumbnail : '') || '',
            qty: parseFloat(document.getElementById('wh-f-qty').value) || 0,
            min_qty: parseFloat(document.getElementById('wh-f-min-qty').value) || 0,
            price_per_unit: parseFloat(document.getElementById('wh-f-price').value) || 0,
            notes: document.getElementById('wh-f-notes').value.trim(),
        };

        await saveWarehouseItem(item);
        App.toast(this.editingId ? 'Позиция обновлена' : 'Позиция добавлена');
        this.hideForm();
        await this.load();
    },

    async deleteFromForm() {
        if (!this.editingId) return;
        const item = this.allItems.find(i => i.id === this.editingId);
        if (!confirm(`Удалить "${item ? item.name : ''}"?`)) return;
        await deleteWarehouseItem(this.editingId);
        App.toast('Позиция удалена');
        this.hideForm();
        await this.load();
    },

    // ==========================================
    // STOCK ADJUSTMENTS
    // ==========================================

    async adjustStock(itemId, qtyChange, reason, orderName, notes, manager, meta) {
        const items = await loadWarehouseItems();
        const idx = items.findIndex(i => i.id === itemId);
        if (idx < 0) return false;

        const item = items[idx];
        const qtyBefore = item.qty || 0;
        item.qty = Math.max(0, qtyBefore + qtyChange);
        item.updated_at = new Date().toISOString();
        items[idx] = item;
        await saveWarehouseItems(items);

        // Record in history
        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now(),
            item_id: itemId,
            item_name: item.name || '',
            item_sku: item.sku || '',
            item_category: item.category || '',
            type: reason || 'adjustment',
            qty_change: qtyChange,
            qty_before: qtyBefore,
            qty_after: item.qty,
            unit_price: parseFloat(item.price_per_unit) || 0,
            total_cost_change: round2(Math.abs(qtyChange) * (parseFloat(item.price_per_unit) || 0)),
            order_id: meta && meta.order_id ? meta.order_id : null,
            order_name: orderName || '',
            notes: notes || '',
            created_at: new Date().toISOString(),
            created_by: manager || '',
        });
        await saveWarehouseHistory(history);
        return true;
    },

    async quickAdjust(itemId, delta) {
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', 'Быстрая корректировка', '');
        await this.load();
    },

    async promptAdjust(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        const input = prompt(`Корректировка "${item.name}" (текущее: ${item.qty})\nВведите изменение (+10 или -5):`);
        if (input === null) return;
        const delta = parseInt(input);
        if (isNaN(delta) || delta === 0) { App.toast('Неверное значение'); return; }

        const reason = prompt('Причина корректировки:') || '';
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', reason, '');
        App.toast(`${item.name}: ${delta > 0 ? '+' : ''}${delta}`);
        await this.load();
    },

    // ==========================================
    // INLINE EDITING (directly in table)
    // ==========================================

    // Visual feedback: flash green + toast
    _inlineSaved(inputEl) {
        // Green flash on the input
        if (inputEl) {
            inputEl.style.transition = 'background 0.2s';
            inputEl.style.background = '#bbf7d0';
            setTimeout(() => { inputEl.style.background = ''; }, 900);
        }
        // Toast notification
        this._showSaveToast();
    },

    _showSaveToast() {
        let toast = document.getElementById('wh-save-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'wh-save-toast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#16a34a;color:#fff;padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.15)';
            document.body.appendChild(toast);
        }
        toast.textContent = '✓ Сохранено в облако';
        toast.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    },

    async inlineQty(itemId, newValueStr, oldQty) {
        const newQty = Math.max(0, parseInt(newValueStr) || 0);
        const delta = newQty - (oldQty || 0);
        if (delta === 0) return;

        const inputEl = document.activeElement;
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', 'Ручная правка', '');
        this._inlineSaved(inputEl);
        await this.load();
    },

    async inlinePrice(itemId, newValueStr) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        const newPrice = Math.max(0, parseFloat(newValueStr) || 0);
        if (newPrice === (item.price_per_unit || 0)) return;

        const inputEl = document.activeElement;
        item.price_per_unit = newPrice;
        item.updated_at = new Date().toISOString();
        await saveWarehouseItem(item);
        this._inlineSaved(inputEl);
        await this.load();
    },

    async inlineColor(itemId, newColor) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        if (newColor === (item.color || '')) return;

        const inputEl = document.activeElement;
        item.color = newColor;
        item.updated_at = new Date().toISOString();
        await saveWarehouseItem(item);
        this._inlineSaved(inputEl);
        await this.load();
    },

    async inlineReserve(itemId, newValueStr, oldReserved) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;

        const newReserved = Math.max(0, parseInt(newValueStr) || 0);
        const maxReserve = item.qty || 0;
        const clampedReserve = Math.min(newReserved, maxReserve);
        const diff = clampedReserve - (oldReserved || 0);
        if (diff === 0) return;

        const inputEl = document.activeElement;
        const reservations = await loadWarehouseReservations();

        if (diff > 0) {
            // Add a manual reservation
            reservations.push({
                id: Date.now(),
                item_id: itemId,
                order_name: 'Ручной резерв',
                qty: diff,
                status: 'active',
                created_at: new Date().toISOString(),
            });
        } else {
            // Release: reduce manual reservations first, then any others
            let toRelease = Math.abs(diff);
            // Sort: manual first, then by date descending
            const itemRes = reservations
                .filter(r => r.item_id === itemId && r.status === 'active')
                .sort((a, b) => {
                    if (a.order_name === 'Ручной резерв' && b.order_name !== 'Ручной резерв') return -1;
                    if (b.order_name === 'Ручной резерв' && a.order_name !== 'Ручной резерв') return 1;
                    return new Date(b.created_at) - new Date(a.created_at);
                });

            for (const res of itemRes) {
                if (toRelease <= 0) break;
                const resIdx = reservations.findIndex(r => r.id === res.id);
                if (resIdx < 0) continue;

                if (res.qty <= toRelease) {
                    toRelease -= res.qty;
                    reservations[resIdx].status = 'released';
                } else {
                    reservations[resIdx].qty -= toRelease;
                    toRelease = 0;
                }
            }
        }

        await saveWarehouseReservations(reservations);
        this._inlineSaved(inputEl);
        await this.load();
    },

    // ==========================================
    // RESERVATIONS
    // ==========================================

    async addReservation(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;

        const available = this.getAvailableQty(item);
        const orderName = prompt(`Резерв "${item.name}" (доступно: ${available})\nДля какого проекта/заказа?`);
        if (!orderName) return;

        const qtyStr = prompt(`Количество для резерва (макс: ${available}):`);
        const qty = parseInt(qtyStr);
        if (!qty || qty <= 0) { App.toast('Неверное количество'); return; }
        if (qty > available) { App.toast(`Недостаточно! Доступно: ${available}`); return; }

        const reservations = await loadWarehouseReservations();
        reservations.push({
            id: Date.now(),
            item_id: itemId,
            order_name: orderName,
            qty: qty,
            status: 'active',
            created_at: new Date().toISOString(),
            created_by: '',
        });
        await saveWarehouseReservations(reservations);
        App.toast(`Зарезервировано: ${qty} шт для "${orderName}"`);
        await this.load();
    },

    async cancelReservation(resId) {
        const reservations = await loadWarehouseReservations();
        const idx = reservations.findIndex(r => r.id === resId);
        if (idx < 0) return;
        reservations[idx].status = 'cancelled';
        await saveWarehouseReservations(reservations);
        App.toast('Резерв отменён');
        await this.load();
        // Re-render reservations if editing
        if (this.editingId) this.renderItemReservations(this.editingId);
    },

    getAvailableQty(item) {
        const activeRes = this.allReservations.filter(
            r => r.item_id === item.id && r.status === 'active'
        );
        const reserved = activeRes.reduce((s, r) => s + (r.qty || 0), 0);
        return Math.max(0, (item.qty || 0) - reserved);
    },

    renderItemReservations(itemId) {
        const container = document.getElementById('wh-reservations-section');
        if (!container) return;
        const activeRes = this.allReservations.filter(r => r.item_id === itemId && r.status === 'active');
        if (activeRes.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Нет активных резервов</p>';
            return;
        }
        container.innerHTML = '<h4 style="margin:0 0 8px;font-size:13px;">Активные резервы:</h4>' +
            activeRes.map(r => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
                <span style="font-weight:600;">${this.esc(r.order_name)}</span>
                <span>${r.qty} шт</span>
                <span style="color:var(--text-muted);">${App.formatDate(r.created_at)}</span>
                <button class="btn btn-sm btn-outline" onclick="Warehouse.cancelReservation(${r.id})" style="margin-left:auto;font-size:10px;padding:1px 6px;">Отменить</button>
            </div>`).join('');
    },

    // ==========================================
    // IMPORT FROM CSV
    // ==========================================

    showImport() {
        document.getElementById('wh-import-form').style.display = '';
        document.getElementById('wh-import-preview').innerHTML = '';
        document.getElementById('wh-import-file').value = '';
        document.getElementById('wh-import-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideImport() {
        document.getElementById('wh-import-form').style.display = 'none';
        this.pendingImport = null;
    },

    processImport() {
        const fileInput = document.getElementById('wh-import-file');
        const category = document.getElementById('wh-import-category').value;
        if (!fileInput.files.length) { App.toast('Выберите файл'); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const items = this.parseCSV(text, category);
                if (items.length === 0) {
                    App.toast('Не удалось распознать данные');
                    return;
                }
                this.pendingImport = { items, category };
                this.showImportPreview(items);
            } catch (err) {
                App.toast('Ошибка чтения файла: ' + err.message);
            }
        };
        reader.readAsText(fileInput.files[0], 'utf-8');
    },

    parseCSV(text, category) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return [];

        const items = [];
        // Try to detect separator: tab or semicolon
        const sep = lines[0].includes('\t') ? '\t' : ';';

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
            // Skip section headers (rows where only col A has text), empty rows, date rows
            if (cols.length < 2) continue;
            if (cols[0] && !cols[1] && !cols[2]) continue; // Section header
            if (cols[0] && cols[0].toLowerCase().includes('дата обновления')) continue;
            if (!cols[0]) continue; // Empty name

            const name = cols[0] || '';
            const sku = cols[1] || '';
            // Determine qty column (varies by sheet structure)
            // Standard: A=name, B=sku, C=size, D=color, E=photo, F=qty
            // Rings/Packaging: A=name, B=sku, C=size, D=color, E=qty
            // Try to find the qty (first numeric column after column 3)
            let qty = 0;
            let size = cols[2] || '';
            let color = cols[3] || '';

            for (let c = 4; c < cols.length; c++) {
                const val = parseFloat(cols[c]);
                if (!isNaN(val) && val >= 0) {
                    qty = val;
                    break;
                }
            }

            // Skip if name looks like a header or section divider
            if (name.toLowerCase() === 'наименование') continue;

            items.push({
                category: category,
                name: name,
                sku: sku,
                size: size,
                color: color,
                unit: 'шт',
                photo_url: '',
                qty: qty,
                min_qty: 0,
                price_per_unit: 0,
                notes: '',
            });
        }

        return items;
    },

    async clearAllPhotos() {
        if (!confirm('Удалить ВСЕ фото во всех позициях склада? Это можно будет откатить кнопкой "Восстановить фото по SKU".')) return;
        let changed = 0;
        this.allItems = this.allItems.map(item => {
            const hasPhoto = !!(item.photo_thumbnail || item.photo_url);
            if (!hasPhoto) return item;
            changed++;
            return { ...item, photo_thumbnail: '', photo_url: '' };
        });
        if (changed === 0) {
            App.toast('Фото уже отсутствуют');
            return;
        }
        await saveWarehouseItems(this.allItems);
        this.setView(this.currentView || 'table');
        App.toast(`Фото очищены: ${changed}`);
    },

    async restorePhotosBySku() {
        const photoBySku = this._getSeedPhotoMapBySku();
        const totalSeedPhotos = Object.keys(photoBySku).length;
        if (totalSeedPhotos === 0) {
            App.toast('Не найден источник фото для восстановления');
            return;
        }
        let restored = 0;
        this.allItems = this.allItems.map(item => {
            const skuKey = this._normStr(item.sku);
            const photo = photoBySku[skuKey];
            if (!photo) return item;
            if (item.photo_thumbnail === photo && !item.photo_url) return item;
            restored++;
            return { ...item, photo_thumbnail: photo, photo_url: '' };
        });
        if (restored === 0) {
            App.toast('Фото уже соответствуют SKU');
            return;
        }
        await saveWarehouseItems(this.allItems);
        this.setView(this.currentView || 'table');
        App.toast(`Фото восстановлены по SKU: ${restored}`);
    },

    showImportPreview(items) {
        const container = document.getElementById('wh-import-preview');
        const cat = WAREHOUSE_CATEGORIES.find(c => c.key === items[0]?.category);
        container.innerHTML = `
            <div style="margin:12px 0;">
                <p style="font-weight:600;">Найдено позиций: ${items.length} ${cat ? '(' + cat.label + ')' : ''}</p>
                <div class="table-wrap" style="max-height:300px;overflow-y:auto;">
                    <table>
                        <thead><tr><th>Название</th><th>Артикул</th><th>Размер</th><th>Цвет</th><th class="text-right">Кол-во</th></tr></thead>
                        <tbody>${items.map(it => `<tr>
                            <td>${this.esc(it.name)}</td>
                            <td>${this.esc(it.sku)}</td>
                            <td>${this.esc(it.size)}</td>
                            <td>${this.esc(it.color)}</td>
                            <td class="text-right">${it.qty}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button class="btn btn-success" onclick="Warehouse.confirmImport()">Импортировать ${items.length} позиций</button>
                    <button class="btn btn-outline" onclick="Warehouse.hideImport()">Отмена</button>
                </div>
            </div>`;
    },

    async confirmImport() {
        if (!this.pendingImport) return;
        const { items } = this.pendingImport;

        for (const item of items) {
            await saveWarehouseItem(item);
            // Small delay to get unique IDs
            await new Promise(r => setTimeout(r, 2));
        }

        // Record in history
        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now(),
            item_id: 0,
            item_name: `Импорт (${items.length} позиций)`,
            item_sku: '',
            type: 'import',
            qty_change: items.reduce((s, i) => s + (i.qty || 0), 0),
            qty_before: 0,
            qty_after: 0,
            order_name: '',
            notes: `Импортировано ${items.length} позиций из CSV`,
            created_at: new Date().toISOString(),
            created_by: '',
        });
        await saveWarehouseHistory(history);

        App.toast(`Импортировано: ${items.length} позиций`);
        this.hideImport();
        await this.load();
    },

    // ==========================================
    // INVENTORY AUDIT (Инвентаризация)
    // ==========================================

    showAudit() {
        document.getElementById('wh-audit-form').style.display = '';
        this.renderAuditTable('');
        document.getElementById('wh-audit-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideAudit() {
        document.getElementById('wh-audit-form').style.display = 'none';
    },

    renderAuditTable(category) {
        let items = [...this.allItems];
        if (category) items = items.filter(i => i.category === category);

        // Sort by category then name
        items.sort((a, b) => {
            if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
            return (a.name || '').localeCompare(b.name || '', 'ru');
        });

        const container = document.getElementById('wh-audit-table');
        if (!container) return;

        container.innerHTML = `<div class="table-wrap" style="max-height:500px;overflow-y:auto;">
            <table>
                <thead><tr>
                    <th>Категория</th>
                    <th>Название</th>
                    <th>Артикул</th>
                    <th class="text-right">В системе</th>
                    <th style="width:100px;">Факт</th>
                    <th class="text-right">Разница</th>
                </tr></thead>
                <tbody>${items.map(item => {
                    const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category);
                    return `<tr>
                        <td><span class="wh-cat-badge" style="background:${cat?.color || '#f1f5f9'};color:${cat?.textColor || '#475569'};">${cat?.label || '?'}</span></td>
                        <td style="font-weight:600;">${this.esc(item.name)}</td>
                        <td style="color:var(--text-muted);font-size:11px;">${this.esc(item.sku || '')}</td>
                        <td class="text-right" style="font-weight:600;">${item.qty || 0}</td>
                        <td><input type="number" class="audit-input" data-id="${item.id}" data-system="${item.qty || 0}" value="" placeholder="${item.qty || 0}" style="width:80px;padding:4px;text-align:right;" oninput="Warehouse.onAuditInput(this)"></td>
                        <td class="text-right audit-diff" id="audit-diff-${item.id}">—</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;
    },

    onAuditInput(el) {
        const systemQty = parseInt(el.dataset.system) || 0;
        const actualQty = parseInt(el.value);
        const diffEl = document.getElementById('audit-diff-' + el.dataset.id);
        if (!diffEl) return;

        if (isNaN(actualQty) || el.value === '') {
            diffEl.textContent = '—';
            diffEl.className = 'text-right audit-diff';
            return;
        }

        const diff = actualQty - systemQty;
        if (diff === 0) {
            diffEl.textContent = '0';
            diffEl.className = 'text-right audit-diff audit-zero';
        } else if (diff > 0) {
            diffEl.textContent = '+' + diff;
            diffEl.className = 'text-right audit-diff audit-positive';
        } else {
            diffEl.textContent = String(diff);
            diffEl.className = 'text-right audit-diff audit-negative';
        }
    },

    async saveAuditResults() {
        const inputs = document.querySelectorAll('.audit-input');
        let adjusted = 0;

        for (const input of inputs) {
            if (input.value === '') continue;
            const itemId = parseInt(input.dataset.id);
            const systemQty = parseInt(input.dataset.system) || 0;
            const actualQty = parseInt(input.value);
            const diff = actualQty - systemQty;

            if (diff === 0 || isNaN(diff)) continue;

            await this.adjustStock(itemId, diff, 'adjustment', '', 'Инвентаризация', '');
            adjusted++;
        }

        if (adjusted === 0) {
            App.toast('Нет изменений для сохранения');
            return;
        }

        App.toast(`Инвентаризация: скорректировано ${adjusted} позиций`);
        this.hideAudit();
        await this.load();
    },

    // ==========================================
    // HISTORY VIEW
    // ==========================================

    async renderHistory() {
        const container = document.getElementById('wh-content');
        if (!container) return;

        const history = await loadWarehouseHistory();
        const sorted = history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-center text-muted">Нет записей</p></div>';
            return;
        }

        const typeIcons = {
            deduction: '📤', addition: '📥', adjustment: '🔧',
            import: '📋', reservation: '📌', unreserve: '🔓',
        };

        container.innerHTML = `<div class="card"><div class="table-wrap" style="max-height:600px;overflow-y:auto;">
            <table>
                <thead><tr>
                    <th style="width:120px;">Дата</th>
                    <th></th>
                    <th>Позиция</th>
                    <th class="text-right">Изменение</th>
                    <th class="text-right">Остаток</th>
                    <th>Причина</th>
                </tr></thead>
                <tbody>${sorted.map(h => {
                    const icon = typeIcons[h.type] || '📋';
                    const changeClass = (h.qty_change || 0) > 0 ? 'text-green' : ((h.qty_change || 0) < 0 ? 'text-red' : '');
                    const changeStr = (h.qty_change || 0) > 0 ? '+' + h.qty_change : String(h.qty_change || 0);
                    return `<tr>
                        <td style="font-size:11px;color:var(--text-muted);">${App.formatDate(h.created_at)}</td>
                        <td>${icon}</td>
                        <td>
                            <div style="font-weight:600;">${this.esc(h.item_name || '')}</div>
                            ${h.item_sku ? `<div style="font-size:10px;color:var(--text-muted);">${this.esc(h.item_sku)}</div>` : ''}
                        </td>
                        <td class="text-right ${changeClass}" style="font-weight:700;">${changeStr}</td>
                        <td class="text-right">${h.qty_after ?? '—'}</td>
                        <td style="font-size:11px;">${this.esc(h.notes || h.order_name || '')}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div></div>`;
    },

    _isSampleStatus(status) {
        return status === 'sample';
    },

    _isProductionStatus(status) {
        return ['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery'].includes(status);
    },

    _projectHardwareKey(orderId, itemId) {
        return `${Number(orderId) || 0}:${Number(itemId) || 0}`;
    },

    _isProjectHardwareReady(orderId, itemId) {
        const checks = (this.projectHardwareState && this.projectHardwareState.checks) || {};
        return !!checks[this._projectHardwareKey(orderId, itemId)];
    },

    async toggleProjectHardwareReady(orderId, itemId, checked) {
        if (!this.projectHardwareState || typeof this.projectHardwareState !== 'object') {
            this.projectHardwareState = { checks: {} };
        }
        if (!this.projectHardwareState.checks || typeof this.projectHardwareState.checks !== 'object') {
            this.projectHardwareState.checks = {};
        }
        const key = this._projectHardwareKey(orderId, itemId);
        if (checked) this.projectHardwareState.checks[key] = true;
        else delete this.projectHardwareState.checks[key];

        this.projectHardwareState.updated_at = new Date().toISOString();
        this.projectHardwareState.updated_by = App.getCurrentEmployeeName();
        await saveProjectHardwareState(this.projectHardwareState);
        this.renderProjectHardwareView();
    },

    _collectWarehouseDemandFromOrderItems(items) {
        const grouped = new Map();
        (items || []).forEach(item => {
            const itemType = item.item_type || '';
            if (itemType !== 'hardware') return;

            const src = (item.source || item.hardware_source || '').toLowerCase();
            if (src !== 'warehouse') return;

            const itemId = Number(item.warehouse_item_id || item.hardware_warehouse_item_id || 0);
            const qty = parseFloat(item.quantity || item.qty || 0) || 0;
            if (!itemId || qty <= 0) return;

            const key = String(itemId);
            const prev = grouped.get(key);
            const name = item.product_name || item.name || '';
            if (!prev) {
                grouped.set(key, {
                    warehouse_item_id: itemId,
                    qty,
                    names: name ? [name] : [],
                });
                return;
            }
            prev.qty += qty;
            if (name && !prev.names.includes(name)) prev.names.push(name);
            grouped.set(key, prev);
        });
        return Array.from(grouped.values());
    },

    async renderProjectHardwareView(viewToken) {
        const token = viewToken ?? this._viewToken;
        const container = document.getElementById('wh-content');
        if (!container) return;

        const [orders, reservations] = await Promise.all([
            loadOrders(),
            loadWarehouseReservations(),
        ]);
        if (token !== this._viewToken || this.currentView !== 'project-hardware') return;
        const byOrderId = new Map((orders || []).map(o => [Number(o.id), o]));
        const byItemId = new Map((this.allItems || []).map(i => [Number(i.id), i]));

        // 1) Reserve block: active auto-reserves for orders in sample status.
        const reserveGrouped = new Map();
        (reservations || []).forEach(r => {
            if (r.status !== 'active' || r.source !== 'order_calc') return;
            const order = byOrderId.get(Number(r.order_id));
            if (!order || !this._isSampleStatus(order.status)) return;
            const item = byItemId.get(Number(r.item_id));
            const key = `${Number(r.order_id)}:${Number(r.item_id)}`;
            const current = reserveGrouped.get(key) || {
                order_id: Number(r.order_id),
                order_name: order.order_name || r.order_name || 'Заказ',
                manager: order.manager_name || '',
                item_id: Number(r.item_id),
                item_name: (item && item.name) || r.item_name || 'Фурнитура',
                item_sku: (item && item.sku) || '',
                qty: 0,
            };
            current.qty += parseFloat(r.qty) || 0;
            reserveGrouped.set(key, current);
        });
        const reserveRows = Array.from(reserveGrouped.values());
        reserveRows.sort((a, b) => String(a.order_name).localeCompare(String(b.order_name), 'ru'));

        // 2) Production block: warehouse hardware demand for production-stage orders.
        const productionOrders = (orders || []).filter(o => this._isProductionStatus(o.status));
        const details = await Promise.all(productionOrders.map(o => loadOrder(o.id).catch(() => null)));
        if (token !== this._viewToken || this.currentView !== 'project-hardware') return;
        const productionRows = [];
        details.filter(Boolean).forEach(detail => {
            const order = detail.order || {};
            const demands = this._collectWarehouseDemandFromOrderItems(detail.items || []);
            demands.forEach(d => {
                const item = byItemId.get(Number(d.warehouse_item_id));
                const ready = this._isProjectHardwareReady(order.id, d.warehouse_item_id);
                productionRows.push({
                    order_id: Number(order.id),
                    order_name: order.order_name || 'Заказ',
                    manager: order.manager_name || '',
                    status: order.status || '',
                    item_id: Number(d.warehouse_item_id),
                    item_name: (item && item.name) || d.names.join(', ') || 'Фурнитура',
                    item_sku: (item && item.sku) || '',
                    qty: parseFloat(d.qty) || 0,
                    ready,
                });
            });
        });
        productionRows.sort((a, b) => String(a.order_name).localeCompare(String(b.order_name), 'ru'));

        const orderProgress = new Map();
        productionRows.forEach(r => {
            const current = orderProgress.get(r.order_id) || { total: 0, ready: 0 };
            current.total += 1;
            if (r.ready) current.ready += 1;
            orderProgress.set(r.order_id, current);
        });

        const reserveByOrder = new Map();
        reserveRows.forEach(r => {
            const key = Number(r.order_id);
            const current = reserveByOrder.get(key) || {
                order_id: key,
                order_name: r.order_name || 'Заказ',
                manager: r.manager || '',
                items: [],
                total_qty: 0,
            };
            current.items.push(r);
            current.total_qty += parseFloat(r.qty) || 0;
            reserveByOrder.set(key, current);
        });
        const reserveOrders = Array.from(reserveByOrder.values()).sort((a, b) =>
            String(a.order_name).localeCompare(String(b.order_name), 'ru')
        );
        reserveOrders.forEach(o => {
            o.items.sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), 'ru'));
        });

        const reserveHtml = reserveOrders.length
            ? `<div style="display:grid;gap:10px;">${reserveOrders.map(o => `
                <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--bg);border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:700;">${this.esc(o.order_name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">Менеджер: ${this.esc(o.manager || '—')} · Резерв: ${o.total_qty}</div>
                        </div>
                        <button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${o.order_id})">Открыть</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Фурнитура</th><th class="text-right">Резерв</th></tr>
                            </thead>
                            <tbody>
                                ${o.items.map(r => `<tr>
                                    <td>
                                        <div>${this.esc(r.item_name)}</div>
                                        ${r.item_sku ? `<div style="font-size:11px;color:var(--text-muted);">${this.esc(r.item_sku)}</div>` : ''}
                                    </td>
                                    <td class="text-right" style="font-weight:700;">${r.qty}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `).join('')}</div>`
            : '<p class="text-muted">Нет активных резервов для заказов в статусе «Образец».</p>';

        const productionByOrder = new Map();
        productionRows.forEach(r => {
            const key = Number(r.order_id);
            const current = productionByOrder.get(key) || {
                order_id: key,
                order_name: r.order_name || 'Заказ',
                manager: r.manager || '',
                status: r.status || '',
                items: [],
                total_qty: 0,
            };
            current.items.push(r);
            current.total_qty += parseFloat(r.qty) || 0;
            productionByOrder.set(key, current);
        });
        const productionOrdersGrouped = Array.from(productionByOrder.values()).sort((a, b) =>
            String(a.order_name).localeCompare(String(b.order_name), 'ru')
        );
        productionOrdersGrouped.forEach(o => {
            o.items.sort((a, b) => String(a.item_name).localeCompare(String(b.item_name), 'ru'));
        });

        const productionHtml = productionOrdersGrouped.length
            ? `<div style="display:grid;gap:10px;">${productionOrdersGrouped.map(o => {
                const p = orderProgress.get(o.order_id) || { total: 0, ready: 0 };
                const done = p.total > 0 && p.ready === p.total;
                const badge = done
                    ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">готово</span>'
                    : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;">не готово</span>';
                return `
                <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--bg);border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:700;">${this.esc(o.order_name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">
                                ${this.esc(App.statusLabel(o.status))} · ${badge} · Менеджер: ${this.esc(o.manager || '—')} · Позиций: ${o.items.length}
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${o.order_id})">Открыть</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Фурнитура</th><th class="text-right">Нужно</th><th>Собрано</th></tr>
                            </thead>
                            <tbody>
                                ${o.items.map(r => `<tr>
                                    <td>
                                        <div>${this.esc(r.item_name)}</div>
                                        ${r.item_sku ? `<div style="font-size:11px;color:var(--text-muted);">${this.esc(r.item_sku)}</div>` : ''}
                                    </td>
                                    <td class="text-right" style="font-weight:700;">${r.qty}</td>
                                    <td>
                                        <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                                            <input type="checkbox" ${r.ready ? 'checked' : ''} onchange="Warehouse.toggleProjectHardwareReady(${r.order_id}, ${r.item_id}, this.checked)">
                                            <span style="font-size:12px;color:var(--text-secondary);">собрано</span>
                                        </label>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
            }).join('')}</div>`
            : '<p class="text-muted">Нет фурнитуры со склада для заказов в производстве.</p>';

        if (token !== this._viewToken || this.currentView !== 'project-hardware') return;
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Резерв (заказы в образце)</h3>
                </div>
                ${reserveHtml}
            </div>
            <div class="card" style="margin-top:12px;">
                <div class="card-header">
                    <h3>Фурнитура для проектов (заказы в производстве)</h3>
                </div>
                ${productionHtml}
            </div>
        `;
    },

    // ==========================================
    // VIEW SWITCHING
    // ==========================================

    applyTabStyles(view) {
        const tabs = document.querySelectorAll('#wh-tabs .tab');
        tabs.forEach(t => {
            const active = t.dataset.tab === view;
            t.classList.toggle('active', active);
            // Keep tab visuals deterministic (index has inline styles).
            t.style.fontWeight = active ? '600' : '500';
            t.style.color = active ? 'var(--text)' : 'var(--text-muted)';
            t.style.borderBottom = active ? '2px solid var(--accent)' : '2px solid transparent';
        });
    },

    setView(view) {
        if (!view) view = 'table';
        if (this._viewInitialized && this.currentView === view && view !== 'shipments') return;
        this._viewInitialized = true;
        this.currentView = view;
        this._viewToken += 1;
        const token = this._viewToken;
        this.applyTabStyles(view);

        const mainContent = document.getElementById('wh-content');
        const shipmentsContent = document.getElementById('wh-shipments-content');
        const filtersCard = document.getElementById('wh-filters-card');

        if (filtersCard) {
            filtersCard.style.display = view === 'table' ? '' : 'none';
        }

        if (view === 'shipments') {
            if (mainContent) mainContent.style.display = 'none';
            if (shipmentsContent) shipmentsContent.style.display = '';
            const now = Date.now();
            if (now - (this._shipmentsLoadedAt || 0) > 1500) {
                this.loadShipmentsList();
                this._shipmentsLoadedAt = now;
            }
        } else {
            if (mainContent) mainContent.style.display = '';
            if (shipmentsContent) shipmentsContent.style.display = 'none';
            if (view === 'history') {
                this.renderHistory();
            } else if (view === 'project-hardware') {
                this.renderProjectHardwareView(token);
            } else if (view === 'ready-goods') {
                this.renderReadyGoodsView();
            } else {
                this.filterAndRender();
            }
        }
    },

    // ==========================================
    // PHOTO UPLOAD
    // ==========================================

    async compressImageToThumbnail(file, maxW, maxH, quality) {
        maxW = maxW || 200; maxH = maxH || 200; quality = quality || 0.7;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => resolve(null);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    },

    async onPhotoFileSelected(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.size > 10 * 1024 * 1024) { App.toast('Файл слишком большой (макс 10 МБ)'); return; }
        const thumbnail = await this.compressImageToThumbnail(file);
        if (!thumbnail) { App.toast('Не удалось обработать фото'); return; }
        this._pendingThumbnail = thumbnail;
        this.updatePhotoPreview(thumbnail);
    },

    onPhotoUrlChanged(url) {
        if (url && url.startsWith('http')) {
            this._pendingThumbnail = null;
            this.updatePhotoPreview(url);
        }
    },

    clearPhoto() {
        this._pendingThumbnail = null;
        document.getElementById('wh-f-photo-url').value = '';
        const fileInput = document.getElementById('wh-f-photo-file');
        if (fileInput) fileInput.value = '';
        const preview = document.getElementById('wh-f-photo-preview');
        if (preview) preview.innerHTML = '<span style="font-size:24px;color:var(--text-muted);">📷</span>';
    },

    updatePhotoPreview(src) {
        const preview = document.getElementById('wh-f-photo-preview');
        if (!preview) return;
        if (src) {
            const safeSrc = src.startsWith('data:') ? src : this.esc(src);
            preview.innerHTML = `<img src="${safeSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:24px;color:var(--text-muted);\\'>❌</span>'">`;
        } else {
            preview.innerHTML = '<span style="font-size:24px;color:var(--text-muted);">📷</span>';
        }
    },

    // ==========================================
    // SHIPMENTS (Приёмки из Китая)
    // ==========================================

    async loadShipmentsList() {
        this.allShipments = await loadShipments();
        this.renderShipmentsList();
    },

    renderShipmentsList() {
        const container = document.getElementById('wh-shipments-list');
        if (!container) return;

        const sorted = [...this.allShipments].sort((a, b) =>
            new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );

        if (sorted.length === 0) {
            container.innerHTML = `<div class="card" style="text-align:center;padding:40px;">
                <div style="font-size:48px;margin-bottom:12px;">📦</div>
                <p style="color:var(--text-muted);margin-bottom:12px;">Нет приёмок</p>
                <button class="btn btn-primary" onclick="Warehouse.showNewShipmentForm()">+ Новая приёмка</button>
            </div>`;
            return;
        }

        const statusBadge = (s) => s === 'received'
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">Принята</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">Черновик</span>';

        container.innerHTML = `
            <div style="margin-bottom:12px;">
                <button class="btn btn-primary" onclick="Warehouse.showNewShipmentForm()">+ Новая приёмка</button>
            </div>
            <div class="card"><div class="table-wrap"><table>
                <thead><tr>
                    <th>Дата</th><th>Название</th><th>Поставщик</th>
                    <th class="text-right">Позиций</th><th class="text-right">Закупка</th>
                    <th class="text-right">Доставка</th><th>Статус</th><th style="width:60px;"></th>
                </tr></thead>
                <tbody>${sorted.map(sh => `<tr style="cursor:pointer;" onclick="Warehouse.editShipment(${sh.id})">
                    <td style="font-size:12px;">${App.formatDate(sh.date || sh.created_at)}</td>
                    <td style="font-weight:600;">${this.esc(sh.shipment_name || '')}</td>
                    <td>${this.esc(sh.supplier || '—')}</td>
                    <td class="text-right">${(sh.items || []).length}</td>
                    <td class="text-right">${Math.round(sh.total_purchase_rub || 0).toLocaleString('ru-RU')} ₽</td>
                    <td class="text-right">${Math.round(sh.total_delivery || 0).toLocaleString('ru-RU')} ₽</td>
                    <td>${statusBadge(sh.status)}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();Warehouse.editShipment(${sh.id})">✎</button></td>
                </tr>`).join('')}</tbody>
            </table></div></div>`;
    },

    showNewShipmentForm() {
        this.editingShipmentId = null;
        this.shipmentItems = [];
        this.clearShipmentForm();
        document.getElementById('wh-shipment-form-title').textContent = 'Новая приёмка';
        document.getElementById('wh-sh-delete-btn').style.display = 'none';
        document.getElementById('wh-sh-confirm-btn').style.display = '';
        document.getElementById('wh-sh-confirm-btn').textContent = 'Принять на склад';
        document.getElementById('wh-sh-update-btn').style.display = 'none';
        document.getElementById('wh-shipment-form').style.display = '';
        this.addShipmentItem();
        document.getElementById('wh-shipment-form').scrollIntoView({ behavior: 'smooth' });
    },

    async editShipment(id) {
        const sh = this.allShipments.find(s => s.id === id);
        if (!sh) return;
        this.editingShipmentId = id;
        this.shipmentItems = JSON.parse(JSON.stringify(sh.items || [])).map(it => ({
            ...it,
            source: it.source || (it.warehouse_item_id ? 'existing' : 'new'),
            unit: it.unit || 'шт',
            category: it.category || 'other',
        }));

        document.getElementById('wh-sh-name').value = sh.shipment_name || '';
        document.getElementById('wh-sh-date').value = sh.date || '';
        document.getElementById('wh-sh-supplier').value = sh.supplier || '';
        document.getElementById('wh-sh-purchase-cny').value = sh.total_purchase_cny || 0;
        document.getElementById('wh-sh-cny-rate').value = sh.cny_rate || 12.5;
        document.getElementById('wh-sh-fee-cashout').value = sh.fee_cashout_percent ?? 1.5;
        document.getElementById('wh-sh-fee-crypto').value = sh.fee_crypto_percent ?? 2;
        document.getElementById('wh-sh-fee-1688').value = sh.fee_1688_percent ?? 3;
        document.getElementById('wh-sh-delivery-china').value = sh.delivery_china_to_russia || 0;
        document.getElementById('wh-sh-delivery-moscow').value = (sh.delivery_moscow || 0) + (sh.customs_fees || 0);
        document.getElementById('wh-sh-pricing-mode').value = sh.pricing_mode || 'weighted_avg';
        document.getElementById('wh-sh-notes').value = sh.notes || '';

        document.getElementById('wh-shipment-form-title').textContent = 'Редактирование приёмки';
        document.getElementById('wh-sh-delete-btn').style.display = '';
        const isReceived = sh.status === 'received';
        document.getElementById('wh-sh-confirm-btn').style.display = isReceived ? 'none' : '';
        document.getElementById('wh-sh-confirm-btn').textContent = 'Принять на склад';
        document.getElementById('wh-sh-update-btn').style.display = isReceived ? '' : 'none';
        document.getElementById('wh-shipment-form').style.display = '';

        this.recalcShipment();
        document.getElementById('wh-shipment-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideShipmentForm() {
        document.getElementById('wh-shipment-form').style.display = 'none';
    },

    clearShipmentForm() {
        ['wh-sh-name', 'wh-sh-supplier', 'wh-sh-notes'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('wh-sh-date').value = App.todayLocalYMD();
        document.getElementById('wh-sh-purchase-cny').value = 0;
        document.getElementById('wh-sh-cny-rate').value = 12.5;
        document.getElementById('wh-sh-fee-cashout').value = 1.5;
        document.getElementById('wh-sh-fee-crypto').value = 2;
        document.getElementById('wh-sh-fee-1688').value = 3;
        document.getElementById('wh-sh-fee-total').value = 0;
        document.getElementById('wh-sh-delivery-china').value = 0;
        document.getElementById('wh-sh-delivery-moscow').value = 0;
        document.getElementById('wh-sh-pricing-mode').value = 'weighted_avg';
        document.getElementById('wh-sh-purchase-rub').value = 0;
        document.getElementById('wh-sh-total-delivery').value = 0;
        document.getElementById('wh-sh-items-table').innerHTML = '';
        document.getElementById('wh-sh-summary').innerHTML = '';
    },

    addShipmentItem() {
        this.shipmentItems.push({
            source: 'existing',
            warehouse_item_id: null, name: '', sku: '', category: '',
            size: '', color: '', unit: 'шт',
            photo_url: '', photo_thumbnail: '',
            qty_received: 0, weight_grams: 0,
            purchase_price_cny: 0, purchase_price_rub: 0,
            delivery_allocated: 0, total_cost_per_unit: 0,
        });
        this.renderShipmentItemsTable();
    },

    removeShipmentItem(idx) {
        this.shipmentItems.splice(idx, 1);
        this.renderShipmentItemsTable();
        this.recalcShipmentValues();
    },

    async renderShipmentItemsTable() {
        const container = document.getElementById('wh-sh-items-table');
        if (!container) return;

        const grouped = await this.getItemsForPicker();
        const categoryOptions = WAREHOUSE_CATEGORIES.map(c =>
            `<option value="${c.key}">${c.icon} ${c.label}</option>`
        ).join('');

        const rows = this.shipmentItems.map((item, idx) => {
            const selectOptions = this.buildPickerOptions(grouped, item.warehouse_item_id, true);
            const simpleSelectHtml = `<select onchange="Warehouse.onShipmentItemSelect(${idx}, this.value)" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;">
                ${selectOptions}
            </select>`;
            const photoSrc = item.photo_thumbnail || item.photo_url || '';
            const photoPreview = photoSrc
                ? `<img src="${this.esc(photoSrc)}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="width:36px;height:36px;display:none;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:14px;">📷</span>`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:14px;">📷</span>`;

            const itemSourceCell = item.source === 'new'
                ? `<div>
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button class="btn btn-sm ${item.source === 'existing' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'existing')">Со склада</button>
                        <button class="btn btn-sm ${item.source === 'new' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'new')">Новая</button>
                    </div>
                    <div style="display:grid;grid-template-columns:minmax(200px,1fr) 120px;gap:6px;">
                        <input type="text" value="${this.esc(item.name || '')}" placeholder="Название позиции" oninput="Warehouse.onShipmentItemField(${idx}, 'name', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <input type="text" value="${this.esc(item.sku || '')}" placeholder="SKU" oninput="Warehouse.onShipmentItemField(${idx}, 'sku', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <select onchange="Warehouse.onShipmentItemField(${idx}, 'category', this.value)" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                            ${categoryOptions.replace(`value="${item.category}"`, `value="${item.category}" selected`)}
                        </select>
                        <input type="text" value="${this.esc(item.color || '')}" placeholder="Цвет" oninput="Warehouse.onShipmentItemField(${idx}, 'color', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <input type="text" value="${this.esc(item.size || '')}" placeholder="Размер" oninput="Warehouse.onShipmentItemField(${idx}, 'size', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <input type="text" value="${this.esc(item.unit || 'шт')}" placeholder="Ед. изм." oninput="Warehouse.onShipmentItemField(${idx}, 'unit', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
                        ${photoPreview}
                        <input type="url" value="${this.esc(item.photo_url || '')}" placeholder="Ссылка на фото" onchange="Warehouse.onShipmentItemPhotoUrl(${idx}, this.value)" style="flex:1;min-width:120px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <label class="btn btn-sm btn-outline" style="padding:3px 8px;cursor:pointer;font-size:11px;">
                            Фото
                            <input type="file" accept="image/*" style="display:none" onchange="Warehouse.onShipmentItemPhotoFile(${idx}, this)">
                        </label>
                    </div>
                </div>`
                : `<div>
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button class="btn btn-sm ${item.source === 'existing' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'existing')">Со склада</button>
                        <button class="btn btn-sm ${item.source === 'new' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'new')">Новая</button>
                    </div>
                    ${simpleSelectHtml}
                </div>`;

            return `<tr>
                <td>${itemSourceCell}</td>
                <td><input type="number" value="${item.qty_received || ''}" min="0" onchange="Warehouse.onShipmentItemField(${idx}, 'qty_received', this.value)" style="width:70px;text-align:right;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;"></td>
                <td><input type="number" value="${item.weight_grams || ''}" min="0" step="0.1" onchange="Warehouse.onShipmentItemField(${idx}, 'weight_grams', this.value)" style="width:80px;text-align:right;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;"></td>
                <td><input type="number" value="${item.purchase_price_cny || ''}" min="0" step="0.01" onchange="Warehouse.onShipmentItemField(${idx}, 'purchase_price_cny', this.value)" title="Цена за всю позицию/тираж в CNY" style="width:80px;text-align:right;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;"></td>
                <td class="text-right" style="font-size:12px;">${(item.purchase_price_rub || 0).toFixed(2)}</td>
                <td class="text-right" style="font-size:12px;">${Math.round(item.delivery_allocated || 0).toLocaleString('ru-RU')}</td>
                <td class="text-right" style="font-weight:600;font-size:12px;">${(item.total_cost_per_unit || 0).toFixed(2)}</td>
                <td><button class="btn-remove" onclick="Warehouse.removeShipmentItem(${idx})" title="Удалить">&#10005;</button></td>
            </tr>`;
        }).join('');

        container.innerHTML = `<div class="table-wrap"><table style="font-size:12px;">
            <thead><tr>
                <th>Позиция со склада</th>
                <th style="width:70px;">Кол-во</th>
                <th style="width:80px;">Вес (г)</th>
                <th style="width:80px;">Цена CNY (за позицию)</th>
                <th class="text-right" style="width:80px;">Цена RUB/ед</th>
                <th class="text-right" style="width:90px;">Доставка ₽</th>
                <th class="text-right" style="width:90px;">С/с ед. ₽</th>
                <th style="width:30px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    },

    onShipmentPickerSelect(idx, itemId) {
        this.onShipmentItemSelect(idx, itemId);
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');
        this.renderShipmentItemsTable();
    },

    setShipmentItemSource(idx, source) {
        const item = this.shipmentItems[idx];
        if (!item) return;
        item.source = source === 'new' ? 'new' : 'existing';
        if (item.source === 'new') {
            item.warehouse_item_id = null;
            if (!item.category) item.category = 'other';
            if (!item.unit) item.unit = 'шт';
        }
        this.renderShipmentItemsTable();
        this.recalcShipmentValues();
    },

    onShipmentItemSelect(idx, itemIdStr) {
        const itemId = parseInt(itemIdStr) || null;
        const shItem = this.shipmentItems[idx];
        if (!itemId) {
            shItem.warehouse_item_id = null;
            shItem.name = ''; shItem.sku = ''; shItem.category = '';
        } else {
            const whItem = this.allItems.find(i => i.id === itemId);
            if (whItem) {
                shItem.source = 'existing';
                shItem.warehouse_item_id = whItem.id;
                shItem.name = whItem.name || '';
                shItem.sku = whItem.sku || '';
                shItem.category = whItem.category || '';
                shItem.color = whItem.color || '';
                shItem.size = whItem.size || '';
                shItem.unit = whItem.unit || 'шт';
                shItem.photo_url = whItem.photo_url || '';
                shItem.photo_thumbnail = whItem.photo_thumbnail || '';
            }
        }
        this.recalcShipmentValues();
    },

    onShipmentItemField(idx, field, value) {
        const numericFields = new Set(['qty_received', 'weight_grams', 'purchase_price_cny', 'purchase_price_rub', 'delivery_allocated', 'total_cost_per_unit']);
        this.shipmentItems[idx][field] = numericFields.has(field) ? (parseFloat(value) || 0) : String(value || '');
        this.recalcShipmentValues();
    },

    onShipmentItemPhotoUrl(idx, value) {
        const item = this.shipmentItems[idx];
        if (!item) return;
        item.photo_url = String(value || '').trim();
        if (item.photo_url) item.photo_thumbnail = '';
        this.renderShipmentItemsTable();
    },

    async onShipmentItemPhotoFile(idx, input) {
        if (!input || !input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.size > 10 * 1024 * 1024) { App.toast('Файл слишком большой (макс 10 МБ)'); return; }
        const thumbnail = await this.compressImageToThumbnail(file, 200, 200, 0.72);
        if (!thumbnail) { App.toast('Не удалось обработать фото'); return; }
        const item = this.shipmentItems[idx];
        if (!item) return;
        item.photo_thumbnail = thumbnail;
        item.photo_url = '';
        this.renderShipmentItemsTable();
    },

    recalcShipment() {
        // Called from form-level inputs (oninput), recalculates and re-renders items
        this.recalcShipmentValues();
        this.renderShipmentItemsTable();
    },

    recalcShipmentValues() {
        // purchase_price_cny хранится как цена за всю позицию (тираж), не за 1 шт.
        const cny = this.shipmentItems.reduce((sum, i) => {
            const priceCnyTotal = parseFloat(i.purchase_price_cny) || 0;
            return sum + priceCnyTotal;
        }, 0);
        document.getElementById('wh-sh-purchase-cny').value = (Math.round(cny * 100) / 100).toString();

        const rate = parseFloat(document.getElementById('wh-sh-cny-rate').value) || 0;
        const feeCashout = parseFloat(document.getElementById('wh-sh-fee-cashout').value) || 0;
        const feeCrypto = parseFloat(document.getElementById('wh-sh-fee-crypto').value) || 0;
        const fee1688 = parseFloat(document.getElementById('wh-sh-fee-1688').value) || 0;
        const feeTotalPct = feeCashout + feeCrypto + fee1688;
        const feeMultiplier = 1 + (feeTotalPct / 100);
        document.getElementById('wh-sh-fee-total').value = (Math.round(feeTotalPct * 100) / 100).toString();

        const purchaseRub = cny * rate * feeMultiplier;
        document.getElementById('wh-sh-purchase-rub').value = Math.round(purchaseRub).toString();

        const deliveryChina = parseFloat(document.getElementById('wh-sh-delivery-china').value) || 0;
        const deliveryMoscow = parseFloat(document.getElementById('wh-sh-delivery-moscow').value) || 0;
        const totalDelivery = deliveryChina + deliveryMoscow;
        document.getElementById('wh-sh-total-delivery').value = Math.round(totalDelivery).toString();

        const totalWeight = this.shipmentItems.reduce((s, i) => s + (i.weight_grams || 0), 0);

        this.shipmentItems.forEach(item => {
            const qty = parseFloat(item.qty_received) || 0;
            const lineCnyTotal = parseFloat(item.purchase_price_cny) || 0;
            const lineRubTotal = lineCnyTotal * rate * feeMultiplier;
            item.purchase_price_rub = qty > 0 ? (lineRubTotal / qty) : 0;
            item.delivery_allocated = totalWeight > 0
                ? totalDelivery * ((item.weight_grams || 0) / totalWeight) : 0;
            item.total_cost_per_unit = qty > 0
                ? item.purchase_price_rub + (item.delivery_allocated / qty) : 0;
        });

        // Update summary
        const totalItems = this.shipmentItems.length;
        const totalQty = this.shipmentItems.reduce((s, i) => s + (i.qty_received || 0), 0);
        const avgCost = totalQty > 0
            ? this.shipmentItems.reduce((s, i) => s + (i.total_cost_per_unit || 0) * (i.qty_received || 0), 0) / totalQty : 0;

        const summaryEl = document.getElementById('wh-sh-summary');
        if (summaryEl) {
            summaryEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;">
                <div><span style="color:var(--text-muted);font-size:11px;">Позиций:</span><br><b>${totalItems}</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Общее кол-во:</span><br><b>${totalQty.toLocaleString('ru-RU')}</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Общий вес:</span><br><b>${totalWeight.toLocaleString('ru-RU')} г</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Товары (CNY):</span><br><b>${(Math.round(cny * 100) / 100).toLocaleString('ru-RU')} ¥</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Закупка с комиссиями:</span><br><b>${Math.round(purchaseRub).toLocaleString('ru-RU')} ₽</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Доставка:</span><br><b>${Math.round(totalDelivery).toLocaleString('ru-RU')} ₽</b></div>
                <div><span style="color:var(--text-muted);font-size:11px;">Ср. с/с ед.:</span><br><b>${avgCost.toFixed(2)} ₽</b></div>
            </div>`;
        }
    },

    _buildShipmentData() {
        const name = document.getElementById('wh-sh-name').value.trim();
        if (!name) { App.toast('Укажите название поставки'); return null; }

        const cny = this.shipmentItems.reduce((sum, i) => {
            const priceCnyTotal = parseFloat(i.purchase_price_cny) || 0;
            return sum + priceCnyTotal;
        }, 0);
        const rate = parseFloat(document.getElementById('wh-sh-cny-rate').value) || 0;
        const feeCashout = parseFloat(document.getElementById('wh-sh-fee-cashout').value) || 0;
        const feeCrypto = parseFloat(document.getElementById('wh-sh-fee-crypto').value) || 0;
        const fee1688 = parseFloat(document.getElementById('wh-sh-fee-1688').value) || 0;
        const feeTotalPct = feeCashout + feeCrypto + fee1688;
        const feeMultiplier = 1 + feeTotalPct / 100;

        return {
            id: this.editingShipmentId || undefined,
            date: document.getElementById('wh-sh-date').value,
            shipment_name: name,
            supplier: document.getElementById('wh-sh-supplier').value.trim(),
            total_purchase_cny: cny,
            cny_rate: rate,
            fee_cashout_percent: feeCashout,
            fee_crypto_percent: feeCrypto,
            fee_1688_percent: fee1688,
            fee_total_percent: feeTotalPct,
            total_purchase_rub: cny * rate * feeMultiplier,
            delivery_china_to_russia: parseFloat(document.getElementById('wh-sh-delivery-china').value) || 0,
            delivery_moscow: parseFloat(document.getElementById('wh-sh-delivery-moscow').value) || 0,
            customs_fees: 0,
            total_delivery: parseFloat(document.getElementById('wh-sh-total-delivery').value) || 0,
            pricing_mode: document.getElementById('wh-sh-pricing-mode').value || 'weighted_avg',
            items: JSON.parse(JSON.stringify(this.shipmentItems)),
            total_weight_grams: this.shipmentItems.reduce((s, i) => s + (i.weight_grams || 0), 0),
            notes: document.getElementById('wh-sh-notes').value.trim(),
        };
    },

    async saveShipmentDraft() {
        const data = this._buildShipmentData();
        if (!data) return;
        data.status = this.editingShipmentId
            ? (this.allShipments.find(s => s.id === this.editingShipmentId) || {}).status || 'draft'
            : 'draft';
        await saveShipment(data);
        App.toast('Черновик сохранён');
        this.hideShipmentForm();
        await this.loadShipmentsList();
    },

    async confirmShipment() {
        const data = this._buildShipmentData();
        if (!data) return;

        const validItemsRaw = data.items.filter(i => {
            const qty = parseFloat(i.qty_received) || 0;
            if (qty <= 0) return false;
            return !!i.warehouse_item_id || (i.source === 'new' && (i.name || '').trim());
        });
        if (validItemsRaw.length === 0) {
            App.toast('Добавьте хотя бы одну позицию с кол-вом > 0');
            return;
        }

        const existingShipment = this.editingShipmentId
            ? this.allShipments.find(s => s.id === this.editingShipmentId)
            : null;
        const isRepost = !!(existingShipment && existingShipment.status === 'received');
        const confirmText = isRepost
            ? `Перепровести приёмку (${validItemsRaw.length} позиций)?\nОстатки на складе будут пересчитаны по разнице.`
            : `Принять ${validItemsRaw.length} позиций на склад?\nОстатки и себестоимость будут обновлены.`;
        if (!confirm(confirmText)) return;

        const itemsBefore = await loadWarehouseItems();
        const beforeById = new Map(itemsBefore.map(i => [i.id, {
            qty: i.qty || 0,
            price: i.price_per_unit || 0,
        }]));

        // Ensure all "new" items are matched with existing stock or created once.
        for (const shItem of validItemsRaw) {
            if (shItem.warehouse_item_id) continue;
            const matched = this._findExistingItemForShipment(shItem, itemsBefore);
            if (matched) {
                shItem.warehouse_item_id = matched.id;
                continue;
            }
            const newItem = {
                category: shItem.category || 'other',
                name: (shItem.name || '').trim(),
                sku: (shItem.sku || '').trim(),
                size: (shItem.size || '').trim(),
                color: (shItem.color || '').trim(),
                unit: (shItem.unit || 'шт').trim() || 'шт',
                photo_url: (shItem.photo_url || '').trim(),
                photo_thumbnail: shItem.photo_thumbnail || '',
                qty: 0,
                min_qty: 0,
                price_per_unit: Math.round((shItem.total_cost_per_unit || 0) * 100) / 100,
                notes: 'Создано автоматически из приёмки Китая',
            };
            const newId = await saveWarehouseItem(newItem);
            shItem.warehouse_item_id = newId;
            beforeById.set(newId, { qty: 0, price: newItem.price_per_unit || 0 });
            itemsBefore.push({ ...newItem, id: newId, qty: 0 });
        }

        const validItems = this._mergeShipmentItemsByWarehouseId(validItemsRaw);
        const previousItems = isRepost
            ? this._mergeShipmentItemsByWarehouseId((existingShipment.items || []).filter(i => {
                const qty = parseFloat(i.qty_received) || 0;
                return qty > 0 && !!i.warehouse_item_id;
            }))
            : [];

        const prevQtyById = new Map();
        previousItems.forEach(i => {
            prevQtyById.set(i.warehouse_item_id, (prevQtyById.get(i.warehouse_item_id) || 0) + (parseFloat(i.qty_received) || 0));
        });
        const newQtyById = new Map();
        validItems.forEach(i => {
            newQtyById.set(i.warehouse_item_id, (newQtyById.get(i.warehouse_item_id) || 0) + (parseFloat(i.qty_received) || 0));
        });

        data.items = validItems;
        data.status = 'received';
        if (data.source === 'china_consolidation') data.china_box_status = 'received';
        data.received_at = new Date().toISOString();
        await saveShipment(data);

        // If this receipt came from China consolidation, mark linked purchases as received too.
        if (Array.isArray(data.china_purchase_ids) && data.china_purchase_ids.length) {
            for (const purchaseId of data.china_purchase_ids) {
                const purchase = await loadChinaPurchase(purchaseId);
                if (!purchase) continue;
                purchase.shipment_id = data.id;
                purchase.delivery_type = data.china_delivery_type || purchase.delivery_type || '';
                purchase.tracking_number = data.china_tracking_number || purchase.tracking_number || '';
                purchase.estimated_days = data.china_estimated_days || purchase.estimated_days || 0;
                purchase.status = 'received';
                purchase.status_history = Array.isArray(purchase.status_history) ? purchase.status_history : [];
                purchase.status_history.push({
                    status: 'received',
                    date: data.received_at,
                    note: `Принято на склад по коробке «${data.shipment_name || ''}»`,
                });
                await saveChinaPurchase(purchase);
            }
        }

        // Apply stock delta for each item (supports repost/edit of already received shipment)
        const allIds = new Set([...prevQtyById.keys(), ...newQtyById.keys()]);
        for (const itemId of allIds) {
            const prevQty = prevQtyById.get(itemId) || 0;
            const nextQty = newQtyById.get(itemId) || 0;
            const delta = nextQty - prevQty;
            if (!delta) continue;
            const note = isRepost
                ? `Перепроведение приёмки: было ${prevQty}, стало ${nextQty}`
                : `Приёмка: ${nextQty} шт`;
            await this.adjustStock(
                itemId,
                delta,
                delta > 0 ? 'addition' : 'deduction',
                data.shipment_name,
                note,
                ''
            );
        }

        // Update weighted price only for net positive additions
        const pricingMode = data.pricing_mode || 'weighted_avg';
        const itemsAfter = await loadWarehouseItems();
        validItems.forEach(shItem => {
            const idx = itemsAfter.findIndex(i => i.id === shItem.warehouse_item_id);
            if (idx < 0) return;

            const after = itemsAfter[idx];
            const before = beforeById.get(shItem.warehouse_item_id) || { qty: 0, price: after.price_per_unit || 0 };
            const prevQty = prevQtyById.get(shItem.warehouse_item_id) || 0;
            const nextQty = newQtyById.get(shItem.warehouse_item_id) || 0;
            const addedQty = Math.max(0, nextQty - prevQty);
            if (addedQty <= 0) return;
            const newCost = Math.round((parseFloat(shItem.total_cost_per_unit) || 0) * 100) / 100;
            const totalQty = (before.qty || 0) + addedQty;
            const weighted = totalQty > 0
                ? (((before.qty || 0) * (before.price || 0) + addedQty * newCost) / totalQty)
                : newCost;

            after.price_per_unit = Math.round(weighted * 100) / 100;
            after.updated_at = new Date().toISOString();

            if (pricingMode === 'weighted_with_layers') {
                if (!Array.isArray(after.cost_layers)) after.cost_layers = [];
                after.cost_layers.push({
                    shipment_id: data.id,
                    shipment_name: data.shipment_name || '',
                    received_at: data.received_at,
                    qty_added: addedQty,
                    unit_cost: newCost,
                });
            }

            itemsAfter[idx] = after;
        });
        await saveWarehouseItems(itemsAfter);

        App.toast(isRepost
            ? `Приёмка перепроведена: ${validItems.length} позиций обновлено`
            : `Приёмка завершена: ${validItems.length} позиций на складе`);
        this.hideShipmentForm();
        await this.load();
        this.setView('shipments');
    },

    async updateShipmentValues() {
        if (!this.editingShipmentId) {
            App.toast('Сначала откройте приёмку для редактирования');
            return;
        }
        const sh = this.allShipments.find(s => s.id === this.editingShipmentId);
        if (!sh || sh.status !== 'received') {
            App.toast('Эта кнопка доступна только для уже принятой приёмки');
            return;
        }
        await this.confirmShipment();
    },

    async deleteShipmentFromForm() {
        if (!this.editingShipmentId) return;
        if (!confirm('Удалить эту приёмку?')) return;
        await deleteShipment(this.editingShipmentId);
        App.toast('Приёмка удалена');
        this.hideShipmentForm();
        await this.loadShipmentsList();
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _normStr(v) {
        return String(v || '').trim().toLowerCase();
    },

    _formatMoney(value) {
        const rounded = Math.round((parseFloat(value) || 0) * 100) / 100;
        return `${rounded.toLocaleString('ru-RU')} ₽`;
    },

    async _getReadyGoodsFrozenAmount() {
        const rg = await loadReadyGoods();
        return rg.reduce((sum, row) => {
            const qty = Math.max(0, parseFloat(row.qty) || 0);
            const unitCost = Math.max(0, parseFloat(row.cost_per_unit) || 0);
            return sum + qty * unitCost;
        }, 0);
    },

    // ==========================================
    // READY GOODS (Готовая продукция)
    // ==========================================

    async renderReadyGoodsView() {
        const container = document.getElementById('wh-content');
        if (!container) return;
        const filtersCard = document.getElementById('wh-filters-card');
        if (filtersCard) filtersCard.style.display = 'none';

        const rg = await loadReadyGoods();
        const salesRecords = await loadSalesRecords();

        // Stats
        const totalQty = rg.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const totalValue = rg.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.cost_per_unit) || 0), 0);
        const totalSalesRevenue = salesRecords.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
        const totalSalesCost = salesRecords.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.cost_per_unit) || 0), 0);
        const totalProfit = totalSalesRevenue - totalSalesCost;

        let html = `
        <div class="stats-grid" style="margin-bottom:16px;">
            <div class="stat-card">
                <div class="stat-label">На складе (шт)</div>
                <div class="stat-value">${totalQty}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Стоимость на складе</div>
                <div class="stat-value">${this._formatMoney(totalValue)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Выручка продаж</div>
                <div class="stat-value" style="color:var(--green)">${this._formatMoney(totalSalesRevenue)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Прибыль продаж</div>
                <div class="stat-value" style="color:${totalProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${this._formatMoney(totalProfit)}</div>
            </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;">
            <button class="btn btn-primary" onclick="Warehouse.showWriteOffDialog()">📤 Списать продажу</button>
            <button class="btn btn-outline" onclick="Warehouse.showAddReadyGoodsDialog()">+ Добавить вручную</button>
        </div>
        `;

        // Ready goods table
        if (rg.length === 0) {
            html += `<div class="card"><div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>Нет готовой продукции на складе</p>
                <p style="font-size:12px;color:var(--text-muted);">Товары появятся здесь когда заказы перейдут в статус «Готово»</p>
            </div></div>`;
        } else {
            const rows = rg.filter(i => (parseFloat(i.qty) || 0) > 0).map(item => {
                const cost = parseFloat(item.cost_per_unit) || 0;
                const qty = parseFloat(item.qty) || 0;
                return `<tr>
                    <td style="font-weight:600;">${this.esc(item.product_name || '—')}</td>
                    <td style="font-size:12px;color:var(--text-muted);">${this.esc(item.order_name || '—')}</td>
                    <td style="font-size:12px;">${this.esc(item.marketplace_set || '—')}</td>
                    <td class="text-right">${qty}</td>
                    <td class="text-right">${this._formatMoney(cost)}</td>
                    <td class="text-right">${this._formatMoney(qty * cost)}</td>
                    <td style="font-size:11px;color:var(--text-muted);">${item.added_at ? new Date(item.added_at).toLocaleDateString('ru-RU') : '—'}</td>
                </tr>`;
            }).join('');

            html += `<div class="card" style="margin-bottom:16px;"><div class="table-wrap"><table>
                <thead><tr>
                    <th>Товар</th>
                    <th>Из заказа</th>
                    <th>Набор</th>
                    <th class="text-right">Кол-во</th>
                    <th class="text-right">Себестоимость/шт</th>
                    <th class="text-right">Сумма</th>
                    <th>Дата</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div></div>`;
        }

        // Sales history
        if (salesRecords.length > 0) {
            const salesRows = [...salesRecords].sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => {
                const channel = r.channel === 'marketplace' ? '🏪 Маркетплейс' : (r.channel === 'website' ? '🌐 Сайт' : '📋 Другое');
                const profit = (parseFloat(r.revenue) || 0) - (parseFloat(r.qty) || 0) * (parseFloat(r.cost_per_unit) || 0);
                return `<tr>
                    <td style="font-size:12px;">${r.date ? new Date(r.date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td style="font-weight:600;">${this.esc(r.product_name || '—')}</td>
                    <td>${channel}</td>
                    <td class="text-right">${r.qty || 0}</td>
                    <td class="text-right">${this._formatMoney(r.revenue || 0)}</td>
                    <td class="text-right">${this._formatMoney(r.payout || 0)}</td>
                    <td class="text-right" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">${this._formatMoney(profit)}</td>
                    <td style="font-size:11px;color:var(--text-muted);">${this.esc(r.notes || '')}</td>
                </tr>`;
            }).join('');

            html += `<h3 style="margin:16px 0 8px;">История продаж</h3>
            <div class="card"><div class="table-wrap"><table>
                <thead><tr>
                    <th>Дата</th>
                    <th>Товар</th>
                    <th>Канал</th>
                    <th class="text-right">Кол-во</th>
                    <th class="text-right">Выручка</th>
                    <th class="text-right">Поступление</th>
                    <th class="text-right">Прибыль</th>
                    <th>Заметки</th>
                </tr></thead>
                <tbody>${salesRows}</tbody>
            </table></div></div>`;
        }

        container.innerHTML = html;
    },

    async showWriteOffDialog() {
        const rg = (await loadReadyGoods()).filter(i => (parseFloat(i.qty) || 0) > 0);
        if (rg.length === 0) {
            App.toast('Нет товаров для списания');
            return;
        }

        const existing = document.getElementById('rg-writeoff-dialog');
        if (existing) existing.remove();

        const opts = rg.map((item, i) => {
            const label = `${item.product_name} (${item.qty} шт, себест. ${this._formatMoney(item.cost_per_unit || 0)})`;
            return `<option value="${i}">${this.esc(label)}</option>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.id = 'rg-writeoff-dialog';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:12px;padding:24px;width:480px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">📤 Списать продажу</h3>
                <button onclick="this.closest('#rg-writeoff-dialog').remove()" class="btn-remove" style="font-size:10px;width:24px;height:24px;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Товар</label>
                <select id="rg-wo-product" class="calc-input" style="width:100%;">${opts}</select>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Кол-во</label>
                    <input id="rg-wo-qty" type="number" class="calc-input" value="1" min="1" style="width:100%;">
                </div>
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Канал</label>
                    <select id="rg-wo-channel" class="calc-input" style="width:100%;">
                        <option value="website">🌐 Сайт (эквайринг)</option>
                        <option value="marketplace">🏪 Маркетплейс</option>
                        <option value="other">📋 Другое</option>
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Выручка (цена продажи × кол-во)</label>
                    <input id="rg-wo-revenue" type="number" class="calc-input" value="0" min="0" step="0.01" style="width:100%;">
                </div>
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Фактическое поступление (за вычетом комиссий)</label>
                    <input id="rg-wo-payout" type="number" class="calc-input" value="0" min="0" step="0.01" style="width:100%;">
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Заметки</label>
                <input id="rg-wo-notes" type="text" class="calc-input" placeholder="Wildberries, Ozon, эквайринг..." style="width:100%;">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-outline" onclick="this.closest('#rg-writeoff-dialog').remove()">Отмена</button>
                <button class="btn btn-primary" onclick="Warehouse.doWriteOff()">Списать</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    },

    async doWriteOff() {
        const rg = (await loadReadyGoods()).filter(i => (parseFloat(i.qty) || 0) > 0);
        const idx = parseInt(document.getElementById('rg-wo-product').value);
        const item = rg[idx];
        if (!item) { App.toast('Товар не найден'); return; }

        const qty = parseInt(document.getElementById('rg-wo-qty').value) || 0;
        if (qty <= 0) { App.toast('Укажите количество'); return; }
        if (qty > item.qty) { App.toast(`На складе только ${item.qty} шт`); return; }

        const channel = document.getElementById('rg-wo-channel').value;
        const revenue = parseFloat(document.getElementById('rg-wo-revenue').value) || 0;
        const payout = parseFloat(document.getElementById('rg-wo-payout').value) || 0;
        const notes = (document.getElementById('rg-wo-notes').value || '').trim();

        // Deduct from ready goods
        const allRg = await loadReadyGoods();
        const rgItem = allRg.find(i => i.id === item.id);
        if (rgItem) {
            rgItem.qty = Math.max(0, (rgItem.qty || 0) - qty);
        }
        await saveReadyGoods(allRg);

        // Record sale
        const records = await loadSalesRecords();
        records.push({
            id: Date.now(),
            ready_goods_id: item.id,
            product_name: item.product_name,
            order_name: item.order_name || '',
            marketplace_set: item.marketplace_set || '',
            channel,
            qty,
            cost_per_unit: item.cost_per_unit || 0,
            revenue,
            payout,
            notes,
            date: new Date().toISOString(),
            created_by: App.getCurrentEmployeeName() || '',
        });
        await saveSalesRecords(records);

        // History
        const history = await loadReadyGoodsHistory();
        history.push({
            id: Date.now(),
            type: 'writeoff',
            product_name: item.product_name,
            qty: -qty,
            channel,
            revenue,
            payout,
            notes: `Продажа: ${channel === 'marketplace' ? 'маркетплейс' : channel === 'website' ? 'сайт' : 'другое'}. ${notes}`,
            date: new Date().toISOString(),
            created_by: App.getCurrentEmployeeName() || '',
        });
        await saveReadyGoodsHistory(history);

        const dialog = document.getElementById('rg-writeoff-dialog');
        if (dialog) dialog.remove();

        App.toast(`Списано ${qty} шт «${item.product_name}»`);
        this.renderStats();
        this.renderReadyGoodsView();
    },

    showAddReadyGoodsDialog() {
        const existing = document.getElementById('rg-add-dialog');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'rg-add-dialog';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:12px;padding:24px;width:440px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">+ Добавить готовую продукцию</h3>
                <button onclick="this.closest('#rg-add-dialog').remove()" class="btn-remove" style="font-size:10px;width:24px;height:24px;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Название товара</label>
                <input id="rg-add-name" type="text" class="calc-input" placeholder="Брелок Треугольник" style="width:100%;">
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Количество</label>
                    <input id="rg-add-qty" type="number" class="calc-input" value="1" min="1" style="width:100%;">
                </div>
                <div style="flex:1;">
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Себестоимость/шт</label>
                    <input id="rg-add-cost" type="number" class="calc-input" value="0" min="0" step="0.01" style="width:100%;">
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Набор / Заметка</label>
                <input id="rg-add-set" type="text" class="calc-input" placeholder="Название набора" style="width:100%;">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-outline" onclick="this.closest('#rg-add-dialog').remove()">Отмена</button>
                <button class="btn btn-primary" onclick="Warehouse.doAddReadyGoods()">Добавить</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    },

    async doAddReadyGoods() {
        const name = (document.getElementById('rg-add-name').value || '').trim();
        if (!name) { App.toast('Укажите название'); return; }
        const qty = parseInt(document.getElementById('rg-add-qty').value) || 0;
        if (qty <= 0) { App.toast('Укажите количество'); return; }
        const cost = parseFloat(document.getElementById('rg-add-cost').value) || 0;
        const setName = (document.getElementById('rg-add-set').value || '').trim();

        const rg = await loadReadyGoods();
        rg.push({
            id: Date.now(),
            product_name: name,
            order_name: 'Ручное добавление',
            order_id: null,
            marketplace_set: setName,
            qty,
            cost_per_unit: cost,
            added_at: new Date().toISOString(),
            added_by: App.getCurrentEmployeeName() || '',
        });
        await saveReadyGoods(rg);

        const history = await loadReadyGoodsHistory();
        history.push({
            id: Date.now(),
            type: 'manual_add',
            product_name: name,
            qty,
            notes: `Ручное добавление: ${name} × ${qty}`,
            date: new Date().toISOString(),
            created_by: App.getCurrentEmployeeName() || '',
        });
        await saveReadyGoodsHistory(history);

        const dialog = document.getElementById('rg-add-dialog');
        if (dialog) dialog.remove();
        App.toast(`Добавлено ${qty} шт «${name}»`);
        this.renderStats();
        this.renderReadyGoodsView();
    },

    // Move products from a completed order to ready goods
    async moveOrderToReadyGoods(orderId, orderName) {
        const data = await loadOrder(orderId);
        if (!data || !data.items) return;

        const rg = await loadReadyGoods();
        const history = await loadReadyGoodsHistory();
        const nowIso = new Date().toISOString();
        const employee = App.getCurrentEmployeeName() || '';
        let addedCount = 0;

        // Only move product-type items (not hardware/packaging raw materials)
        data.items.filter(it => it.item_type === 'product').forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            if (qty <= 0) return;

            // Calculate unit cost: total cost / quantity
            const costTotal = parseFloat(item.cost_total) || 0;
            const costPerUnit = qty > 0 ? Math.round(costTotal * 100) / 100 : 0;

            rg.push({
                id: Date.now() + addedCount,
                product_name: item.product_name || 'Товар',
                order_name: orderName || 'Заказ',
                order_id: orderId,
                marketplace_set: item.marketplace_set_name || '',
                qty,
                cost_per_unit: costPerUnit,
                added_at: nowIso,
                added_by: employee,
            });

            history.push({
                id: Date.now() + addedCount + 50000,
                type: 'from_order',
                product_name: item.product_name || 'Товар',
                order_name: orderName,
                qty,
                cost_per_unit: costPerUnit,
                notes: `Из заказа «${orderName}»: ${item.product_name} × ${qty}`,
                date: nowIso,
                created_by: employee,
            });

            addedCount++;
        });

        if (addedCount > 0) {
            await saveReadyGoods(rg);
            await saveReadyGoodsHistory(history);
        }
        return addedCount;
    },

    _getSeedPhotoMapBySku() {
        const map = {};

        // Preferred source: explicit sku->photo mapping (if present).
        if (typeof WAREHOUSE_SEED_PHOTOS_BY_SKU !== 'undefined' && WAREHOUSE_SEED_PHOTOS_BY_SKU) {
            Object.entries(WAREHOUSE_SEED_PHOTOS_BY_SKU).forEach(([sku, photo]) => {
                const key = this._normStr(sku);
                if (key && photo) map[key] = photo;
            });
            if (Object.keys(map).length > 0) return map;
        }

        // Fallback: build mapping from seed rows by their sku and indexed photo.
        if (typeof WAREHOUSE_SEED_DATA === 'undefined' || typeof WAREHOUSE_SEED_PHOTOS === 'undefined') {
            return map;
        }
        WAREHOUSE_SEED_DATA.forEach((seed, i) => {
            const key = this._normStr(seed && seed.sku);
            const photo = WAREHOUSE_SEED_PHOTOS[i];
            if (!key || !photo) return;
            if (!map[key]) map[key] = photo;
        });
        return map;
    },

    _itemIdentityKey(item) {
        return [
            this._normStr(item.category || 'other'),
            this._normStr(item.sku),
            this._normStr(item.name),
            this._normStr(item.size),
            this._normStr(item.color),
            this._normStr(item.unit || 'шт'),
        ].join('|');
    },

    _findExistingItemForShipment(shItem, warehouseItems) {
        const sku = this._normStr(shItem.sku);
        const category = this._normStr(shItem.category);
        if (sku) {
            const bySku = warehouseItems.find(i =>
                this._normStr(i.sku) === sku &&
                (!category || this._normStr(i.category) === category)
            );
            if (bySku) return bySku;
        }
        const key = this._itemIdentityKey(shItem);
        return warehouseItems.find(i => this._itemIdentityKey(i) === key) || null;
    },

    _mergeShipmentItemsByWarehouseId(items) {
        const map = new Map();
        items.forEach(src => {
            const itemId = src.warehouse_item_id;
            const qty = parseFloat(src.qty_received) || 0;
            if (!itemId || qty <= 0) return;

            const cost = parseFloat(src.total_cost_per_unit) || 0;
            const current = map.get(itemId);
            if (!current) {
                map.set(itemId, {
                    ...src,
                    qty_received: qty,
                    weight_grams: parseFloat(src.weight_grams) || 0,
                    purchase_price_cny: parseFloat(src.purchase_price_cny) || 0,
                    purchase_price_rub: parseFloat(src.purchase_price_rub) || 0,
                    delivery_allocated: parseFloat(src.delivery_allocated) || 0,
                    total_cost_per_unit: cost,
                });
                return;
            }

            const oldQty = parseFloat(current.qty_received) || 0;
            const newQty = oldQty + qty;
            current.total_cost_per_unit = newQty > 0
                ? (((parseFloat(current.total_cost_per_unit) || 0) * oldQty + cost * qty) / newQty)
                : 0;
            current.qty_received = newQty;
            current.weight_grams = (parseFloat(current.weight_grams) || 0) + (parseFloat(src.weight_grams) || 0);
            current.purchase_price_cny = (parseFloat(current.purchase_price_cny) || 0) + (parseFloat(src.purchase_price_cny) || 0);
            current.purchase_price_rub = (parseFloat(current.purchase_price_rub) || 0) + (parseFloat(src.purchase_price_rub) || 0);
            current.delivery_allocated = (parseFloat(current.delivery_allocated) || 0) + (parseFloat(src.delivery_allocated) || 0);
            map.set(itemId, current);
        });
        return Array.from(map.values());
    },

    _cleanupZeroDuplicateItems() {
        const grouped = new Map();
        (this.allItems || []).forEach(item => {
            const key = this._itemIdentityKey(item);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        });

        const toRemove = new Set();
        grouped.forEach(group => {
            if (group.length < 2) return;
            const nonZero = group.filter(i => (parseFloat(i.qty) || 0) > 0);
            if (nonZero.length > 0) {
                group.forEach(i => {
                    if ((parseFloat(i.qty) || 0) <= 0) toRemove.add(i.id);
                });
                return;
            }
            const sorted = [...group].sort((a, b) => (a.id || 0) - (b.id || 0));
            sorted.slice(1).forEach(i => toRemove.add(i.id));
        });

        if (toRemove.size === 0) return false;
        this.allItems = this.allItems.filter(i => !toRemove.has(i.id));
        return true;
    },

    // ==========================================
    // PICKER FOR CALCULATOR INTEGRATION
    // ==========================================

    async getItemsForPicker() {
        const items = await loadWarehouseItems();
        const reservations = await loadWarehouseReservations();

        items.forEach(item => {
            const activeRes = reservations.filter(r => r.item_id === item.id && r.status === 'active');
            const reservedQty = activeRes.reduce((s, r) => s + (r.qty || 0), 0);
            item.available_qty = Math.max(0, (item.qty || 0) - reservedQty);
        });

        const grouped = {};
        WAREHOUSE_CATEGORIES.forEach(cat => {
            const catItems = items
                .filter(i => i.category === cat.key)
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
            if (catItems.length > 0) {
                grouped[cat.key] = {
                    label: cat.label,
                    icon: cat.icon,
                    items: catItems.map(i => ({
                        id: i.id,
                        category: i.category,
                        name: i.name || '',
                        sku: i.sku || '',
                        size: i.size || '',
                        color: i.color || '',
                        qty: i.qty || 0,
                        available_qty: i.available_qty || 0,
                        price_per_unit: i.price_per_unit || 0,
                        unit: i.unit || 'шт',
                        photo_thumbnail: i.photo_thumbnail || '',
                    })),
                };
            }
        });
        return grouped;
    },

    buildPickerOptions(grouped, selectedId, showSku = false) {
        let html = '<option value="">— Выберите позицию —</option>';
        for (const catKey of Object.keys(grouped)) {
            const g = grouped[catKey];
            html += `<optgroup label="${g.icon} ${g.label}">`;
            g.items.forEach(item => {
                const parts = [item.name];
                if (showSku && item.sku) parts.push(item.sku);
                if (item.size) parts.push(item.size);
                if (item.color) parts.push(item.color);
                const label = parts.join(' · ');
                const stock = item.available_qty > 0 ? `(${item.available_qty} ${item.unit})` : '(нет)';
                const sel = String(item.id) === String(selectedId) ? ' selected' : '';
                html += `<option value="${item.id}"${sel}>${label} ${stock}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    },

    // Custom image-based picker for calculator
    // onSelectFn: string like "Calculator.onHwWarehouseSelect" or "Calculator.onPkgWarehouseSelect"
    // categoryFilter: null = all, 'hardware' = exclude packaging, 'packaging' = only packaging
    buildImagePicker(containerId, grouped, selectedId, onSelectFn, categoryFilter) {
        const cat = WAREHOUSE_CATEGORIES;
        if (!onSelectFn) onSelectFn = 'Calculator.onHwWarehouseSelect';
        const idxStr = containerId.replace(/^[a-z]+-picker-/, '');

        // Filter categories
        const packagingKeys = ['packaging'];
        const hardwareKeys = Object.keys(grouped).filter(k => !packagingKeys.includes(k));

        let visibleKeys;
        if (categoryFilter === 'packaging') {
            visibleKeys = Object.keys(grouped).filter(k => packagingKeys.includes(k));
        } else if (categoryFilter === 'hardware') {
            visibleKeys = hardwareKeys;
        } else {
            visibleKeys = Object.keys(grouped);
        }

        const selectedItem = selectedId ? this._findInGrouped(grouped, selectedId) : null;

        // Selected display
        let selectedHtml = '';
        if (selectedItem) {
            const parts = [selectedItem.name];
            if (selectedItem.size) parts.push(selectedItem.size);
            if (selectedItem.color) parts.push(selectedItem.color);
            const catObj = cat.find(c => c.key === selectedItem.category) || cat[6];
            const priceStr = selectedItem.price_per_unit > 0 ? (' · ' + new Intl.NumberFormat('ru-RU').format(selectedItem.price_per_unit) + ' \u20BD') : '';
            const photoHtml = selectedItem.photo_thumbnail
                ? `<img src="${selectedItem.photo_thumbnail}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${catObj.color};border-radius:6px;font-size:18px;flex-shrink:0;">${catObj.icon}</span>`;
            selectedHtml = `${photoHtml}<span style="flex:1;min-width:0;"><b style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${parts.join(' · ')}</b><span style="font-size:11px;color:var(--text-muted);">${selectedItem.sku || ''}${selectedItem.sku ? ' · ' : ''}${selectedItem.available_qty} ${selectedItem.unit}${priceStr}</span></span>`;
        } else {
            selectedHtml = '<span style="color:var(--text-muted);font-size:13px;">— Выберите позицию —</span>';
        }

        // Build dropdown items
        let itemsHtml = '';
        for (const catKey of visibleKeys) {
            const g = grouped[catKey];
            if (!g) continue;
            const catObj = cat.find(c => c.key === catKey) || cat[6];
            itemsHtml += `<div class="wh-picker-cat-header" style="padding:6px 10px;font-size:11px;font-weight:700;color:${catObj.textColor};background:${catObj.color};position:sticky;top:0;z-index:1;">${catObj.icon} ${g.label}</div>`;
            g.items.forEach(item => {
                const parts = [item.name];
                if (item.size) parts.push(item.size);
                if (item.color) parts.push(item.color);
                const label = parts.join(' · ');
                const stock = item.available_qty > 0 ? `${item.available_qty} ${item.unit}` : '<span style="color:var(--red);">нет</span>';
                const priceStr = item.price_per_unit > 0 ? (' · ' + new Intl.NumberFormat('ru-RU').format(item.price_per_unit) + ' \u20BD') : '';
                const photoHtml = item.photo_thumbnail
                    ? `<img src="${item.photo_thumbnail}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                    : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:${catObj.color};border-radius:6px;font-size:20px;flex-shrink:0;">${catObj.icon}</span>`;
                const isSelected = item.id === selectedId ? 'background:rgba(59,130,246,0.1);' : '';
                itemsHtml += `<div class="wh-picker-item" data-id="${item.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);${isSelected}" onclick="${onSelectFn}(${idxStr}, '${item.id}')">
                    ${photoHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${item.sku || ''}${item.sku ? ' · ' : ''}${stock}${priceStr}</div>
                    </div>
                </div>`;
            });
        }

        return `<div id="${containerId}" class="wh-img-picker">
            <div class="wh-picker-selected" onclick="Warehouse.togglePicker('${containerId}')">
                ${selectedHtml}
                <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;">&#9662;</span>
            </div>
            <div class="wh-picker-dropdown" style="display:none;">
                <div style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="text" class="wh-picker-search" placeholder="Поиск..." oninput="Warehouse.filterPicker('${containerId}', this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;"></div>
                <div class="wh-picker-list">${itemsHtml}</div>
            </div>
        </div>`;
    },

    _findInGrouped(grouped, id) {
        for (const catKey of Object.keys(grouped)) {
            const found = grouped[catKey].items.find(i => i.id === id);
            if (found) return found;
        }
        return null;
    },

    togglePicker(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const dd = el.querySelector('.wh-picker-dropdown');
        const isOpen = dd.style.display !== 'none';
        // Close all pickers first
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) {
            dd.style.display = 'block';
            const searchInput = dd.querySelector('.wh-picker-search');
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            // Show all items
            dd.querySelectorAll('.wh-picker-item').forEach(i => i.style.display = '');
            dd.querySelectorAll('.wh-picker-item').forEach(i => i.previousElementSibling && i.previousElementSibling.classList && (i.previousElementSibling.style.display = ''));
        }
    },

    filterPicker(containerId, query) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const q = (query || '').toLowerCase().trim();
        const items = el.querySelectorAll('.wh-picker-item');
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = q === '' || text.includes(q) ? '' : 'none';
        });
    },
};

// Close image picker dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.wh-img-picker')) {
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');
    }
});
