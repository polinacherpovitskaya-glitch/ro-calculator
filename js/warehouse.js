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
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-PK-NN","size":"80 см","color":"розовый","qty":85,"price_per_unit":23.0},
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
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-SLD-NN","size":"80 см","color":"салатовый","qty":400,"price_per_unit":23},
    {"category":"cords","name":"Шнур с силик. наконечником","sku":"SLS-800-LZR-NN","size":"80 см","color":"лазурный","qty":138,"price_per_unit":23.0},
    {"category":"cords","name":"Шнур с черн. наконечниками","sku":"SLS-800-BCK-NNBL","size":"80 см","color":"черный","qty":85,"price_per_unit":23.0},
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
    { key: 'molds',      label: 'Молды',     icon: '🧲', color: '#fef2f2', textColor: '#b91c1c' },
    { key: 'other',      label: 'Разное',    icon: '🔹', color: '#f1f5f9', textColor: '#475569' },
];

const DEFAULT_MOLD_CAPACITY_BY_TYPE = {
    customer: 1000,
    blank: 5000,
};
const BLANK_HARDWARE_FILTER_KEY = 'blank_hardware';
const BLANK_HARDWARE_LOW_STOCK_THRESHOLD = 1000;
const MOLD_USAGE_ALERT_STEP = 1000;
const MOLD_USAGE_ALERT_ASSIGNEE_FALLBACKS = {
    lesha: 1772827635013,
    anastasia: 1741700002000,
};

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
    _blankHardwareWarehouseItemIds: new Set(),
    auditDraft: null,

    // ==========================================
    // LIFECYCLE
    // ==========================================

    async load() {
        this.allItems = await loadWarehouseItems();
        await this._loadMoldOrders();
        await this._refreshBlankHardwareWarehouseItemIds();

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

        // Repair untouched seeded rows if the initial quantity in code was wrong or missing.
        {
            let qtyFixedCount = 0;
            this.allItems.forEach(item => {
                const seed = WAREHOUSE_SEED_DATA.find(s => s.sku === item.sku);
                const seedQty = parseFloat(seed && seed.qty);
                if (!Number.isFinite(seedQty)) return;
                const currentQty = parseFloat(item.qty);
                const createdAt = item.created_at ? String(item.created_at) : '';
                const updatedAt = item.updated_at ? String(item.updated_at) : '';
                const looksUntouched = !!createdAt && createdAt === updatedAt;
                if (!looksUntouched) return;
                if (currentQty === seedQty) return;
                item.qty = seedQty;
                item.updated_at = item.created_at || new Date().toISOString();
                qtyFixedCount++;
            });
            if (qtyFixedCount > 0) {
                await saveWarehouseItems(this.allItems);
                console.log(`[Warehouse] Repaired ${qtyFixedCount} untouched seed quantities`);
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
        await this.reconcileProjectHardwareReservations();
        await this._reconcileBlankHardwareLowStockAlerts();
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
            item.reserved_qty = activeRes.reduce((s, r) => s + this._parseWarehouseQty(r.qty), 0);
            item.available_qty = Math.max(0, this._parseWarehouseQty(item.qty) - item.reserved_qty);
        });
    },

    _parseWarehouseQty(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    },

    _supportsFractionalWarehouseQty(unitOrItem) {
        const rawUnit = typeof unitOrItem === 'object' && unitOrItem !== null
            ? unitOrItem.unit
            : unitOrItem;
        const unit = this._normStr(rawUnit || '');
        return unit === 'м' || unit === 'см';
    },

    _warehouseQtyInputStep(unitOrItem) {
        return this._supportsFractionalWarehouseQty(unitOrItem) ? 'any' : '1';
    },

    populateCategoryFilter() {
        const sel = document.getElementById('wh-filter-category');
        if (!sel) return;
        sel.innerHTML = '<option value="">Все категории</option>' +
            WAREHOUSE_CATEGORIES.map(c =>
                `<option value="${c.key}">${c.icon} ${c.label}</option>`
            ).join('') +
            `<option value="${BLANK_HARDWARE_FILTER_KEY}">⭐ Бланковая фурнитура</option>`;
    },

    _auditDraftStorageKey() {
        return 'ro_wh_audit_draft_v2';
    },

    _defaultAuditDraft() {
        return {
            category: '',
            search: '',
            values: {},
            saved_at: '',
        };
    },

    _ensureAuditDraft() {
        if (!this.auditDraft || typeof this.auditDraft !== 'object') {
            this.auditDraft = this._defaultAuditDraft();
        }
        if (!this.auditDraft.values || typeof this.auditDraft.values !== 'object') {
            this.auditDraft.values = {};
        }
        return this.auditDraft;
    },

    _loadAuditDraft() {
        try {
            const raw = localStorage.getItem(this._auditDraftStorageKey());
            if (!raw) return this._defaultAuditDraft();
            const parsed = JSON.parse(raw);
            return {
                ...this._defaultAuditDraft(),
                ...(parsed && typeof parsed === 'object' ? parsed : {}),
                values: parsed && typeof parsed.values === 'object' && parsed.values ? parsed.values : {},
            };
        } catch (_) {
            return this._defaultAuditDraft();
        }
    },

    _persistAuditDraft() {
        const draft = this._ensureAuditDraft();
        draft.saved_at = new Date().toISOString();
        localStorage.setItem(this._auditDraftStorageKey(), JSON.stringify(draft));
        this._updateAuditDraftStatus();
        this._updateAuditSummary();
    },

    saveAuditDraft(showToast = false) {
        this._persistAuditDraft();
        if (showToast) App.toast('Черновик инвентаризации сохранён');
    },

    clearAuditDraft() {
        const hasEntries = Object.keys((this.auditDraft && this.auditDraft.values) || {}).length > 0 || !!(this.auditDraft && this.auditDraft.search);
        if (hasEntries && !confirm('Очистить черновик инвентаризации? Введённые фактические остатки будут сброшены.')) return;
        this.auditDraft = this._defaultAuditDraft();
        localStorage.removeItem(this._auditDraftStorageKey());
        const categoryEl = document.getElementById('wh-audit-category');
        if (categoryEl) categoryEl.value = '';
        const searchEl = document.getElementById('wh-audit-search');
        if (searchEl) searchEl.value = '';
        this.renderAuditTable('');
        this._updateAuditDraftStatus();
        this._updateAuditSummary();
        App.toast('Черновик инвентаризации очищен');
    },

    _populateAuditCategoryFilter() {
        const sel = document.getElementById('wh-audit-category');
        if (!sel) return;
        const counts = new Map();
        (this.allItems || []).forEach(item => {
            const key = String(item && item.category || '');
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const blankCount = (this.allItems || []).filter(item => this._isBlankHardwareWarehouseItem(item)).length;
        const options = ['<option value="">Все категории</option>'];
        WAREHOUSE_CATEGORIES.forEach(cat => {
            const count = counts.get(cat.key) || 0;
            options.push(`<option value="${cat.key}">${cat.icon} ${cat.label}${count ? ` (${count})` : ''}</option>`);
        });
        options.push(`<option value="${BLANK_HARDWARE_FILTER_KEY}">⭐ Бланковая фурнитура${blankCount ? ` (${blankCount})` : ''}</option>`);
        sel.innerHTML = options.join('');
        sel.value = (this.auditDraft && this.auditDraft.category) || '';
        if (sel.value !== ((this.auditDraft && this.auditDraft.category) || '')) {
            sel.value = '';
        }
    },

    _getAuditFilteredItems(category, search) {
        let items = [...(this.allItems || [])];
        if (category) {
            if (category === BLANK_HARDWARE_FILTER_KEY) {
                items = items.filter(item => this._isBlankHardwareWarehouseItem(item));
            } else {
                items = items.filter(item => String(item.category || '') === category);
            }
        }

        const query = String(search || '').trim().toLowerCase();
        if (query) {
            items = items.filter(item =>
                String(item.name || '').toLowerCase().includes(query)
                || String(item.sku || '').toLowerCase().includes(query)
                || String(item.color || '').toLowerCase().includes(query)
            );
        }

        items.sort((a, b) => {
            const catA = String(a && a.category || '');
            const catB = String(b && b.category || '');
            if (catA !== catB) return catA.localeCompare(catB, 'ru');
            return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ru');
        });
        return items;
    },

    _getAuditStoredValue(itemId) {
        const draft = this._ensureAuditDraft();
        const key = String(Number(itemId || 0) || itemId || '');
        return Object.prototype.hasOwnProperty.call(draft.values, key) ? String(draft.values[key]) : '';
    },

    _getAuditDiffMeta(item, actualValue) {
        const systemQty = parseFloat(item && item.qty) || 0;
        const actualQty = actualValue === '' || actualValue == null ? NaN : parseFloat(actualValue);
        if (!Number.isFinite(actualQty)) {
            return {
                systemQty,
                actualQty: null,
                diff: null,
                valueDiff: null,
            };
        }
        const diff = actualQty - systemQty;
        const unitPrice = Math.max(0, parseFloat(item && item.price_per_unit) || 0);
        return {
            systemQty,
            actualQty,
            diff,
            valueDiff: diff * unitPrice,
        };
    },

    _renderAuditDiffMarkup(item, actualValue) {
        const meta = this._getAuditDiffMeta(item, actualValue);
        if (meta.diff == null) {
            return {
                qty: '—',
                qtyClass: 'text-right audit-diff',
                money: '—',
                moneyClass: 'text-right audit-diff',
            };
        }
        if (Math.abs(meta.diff) < 0.000001) {
            return {
                qty: '0',
                qtyClass: 'text-right audit-diff audit-zero',
                money: this._formatMoney(0),
                moneyClass: 'text-right audit-diff audit-zero',
            };
        }
        if (meta.diff > 0) {
            return {
                qty: `+${meta.diff}`,
                qtyClass: 'text-right audit-diff audit-positive',
                money: `+${this._formatMoney(meta.valueDiff)}`,
                moneyClass: 'text-right audit-diff audit-positive',
            };
        }
        return {
            qty: String(meta.diff),
            qtyClass: 'text-right audit-diff audit-negative',
            money: `−${this._formatMoney(Math.abs(meta.valueDiff))}`,
            moneyClass: 'text-right audit-diff audit-negative',
        };
    },

    _updateAuditRowDiff(itemId) {
        const numericId = Number(itemId || 0);
        const item = (this.allItems || []).find(entry => Number(entry && entry.id || 0) === numericId);
        if (!item) return;
        const rendered = this._renderAuditDiffMarkup(item, this._getAuditStoredValue(numericId));
        const diffEl = document.getElementById(`audit-diff-${numericId}`);
        if (diffEl) {
            diffEl.textContent = rendered.qty;
            diffEl.className = rendered.qtyClass;
        }
        const moneyEl = document.getElementById(`audit-money-${numericId}`);
        if (moneyEl) {
            moneyEl.textContent = rendered.money;
            moneyEl.className = rendered.moneyClass;
        }
    },

    _getAuditSummaryStats() {
        const draft = this._ensureAuditDraft();
        const stats = {
            enteredPositions: 0,
            changedPositions: 0,
            shortageQty: 0,
            shortageValue: 0,
            surplusQty: 0,
            surplusValue: 0,
            netQty: 0,
            netValue: 0,
        };

        Object.entries(draft.values || {}).forEach(([rawId, rawValue]) => {
            if (rawValue === '' || rawValue == null) return;
            const itemId = Number(rawId || 0);
            const item = (this.allItems || []).find(entry => Number(entry && entry.id || 0) === itemId);
            if (!item) return;
            stats.enteredPositions += 1;
            const meta = this._getAuditDiffMeta(item, rawValue);
            if (meta.diff == null || Math.abs(meta.diff) < 0.000001) return;
            stats.changedPositions += 1;
            stats.netQty += meta.diff;
            stats.netValue += meta.valueDiff || 0;
            if (meta.diff < 0) {
                stats.shortageQty += Math.abs(meta.diff);
                stats.shortageValue += Math.abs(meta.valueDiff || 0);
            } else {
                stats.surplusQty += meta.diff;
                stats.surplusValue += Math.abs(meta.valueDiff || 0);
            }
        });

        stats.shortageValue = Math.round(stats.shortageValue * 100) / 100;
        stats.surplusValue = Math.round(stats.surplusValue * 100) / 100;
        stats.netValue = Math.round(stats.netValue * 100) / 100;
        return stats;
    },

    _updateAuditDraftStatus() {
        const el = document.getElementById('wh-audit-draft-status');
        if (!el) return;
        const draft = this._ensureAuditDraft();
        const count = Object.values(draft.values || {}).filter(value => String(value || '') !== '').length;
        if (!draft.saved_at) {
            el.textContent = count > 0
                ? `Черновик готов к автосохранению · ${count} поз.`
                : 'Черновик будет сохраняться автоматически';
            return;
        }
        const stamp = new Date(draft.saved_at);
        const safeStamp = Number.isNaN(stamp.getTime()) ? String(draft.saved_at) : stamp.toLocaleString('ru-RU');
        el.textContent = `Черновик автосохранён · ${safeStamp} · ${count} поз.`;
    },

    _updateAuditSummary() {
        const el = document.getElementById('wh-audit-summary');
        if (!el) return;
        const stats = this._getAuditSummaryStats();
        if (stats.changedPositions === 0) {
            el.textContent = stats.enteredPositions > 0
                ? `Проверено ${stats.enteredPositions} поз. · Расхождений пока нет`
                : 'Изменений пока нет';
            return;
        }
        el.textContent = [
            `Позиции с расхождением: ${stats.changedPositions}`,
            `Недостача: ${this._formatMoney(stats.shortageValue)}`,
            `Излишек: ${this._formatMoney(stats.surplusValue)}`,
            `Нетто: ${stats.netValue >= 0 ? '+' : '−'}${this._formatMoney(Math.abs(stats.netValue))}`,
        ].join(' · ');
    },

    // ==========================================
    // STATS
    // ==========================================

    async renderStats() {
        const items = this.allItems;
        const totalItems = items.length;
        const totalQty = items.reduce((s, i) => s + this._parseWarehouseQty(i.qty), 0);
        const totalReserved = items.reduce((s, i) => s + this._parseWarehouseQty(i.reserved_qty), 0);
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
            if (cat.value === BLANK_HARDWARE_FILTER_KEY) {
                items = items.filter(i => this._isBlankHardwareWarehouseItem(i));
            } else {
                items = items.filter(i => i.category === cat.value);
            }
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

    _isMoldCategory(category) {
        return String(category || '').toLowerCase() === 'molds';
    },

    _normalizeMoldType(value) {
        return String(value || '').toLowerCase() === 'blank' ? 'blank' : 'customer';
    },

    _defaultMoldCapacityTotal(moldType) {
        return DEFAULT_MOLD_CAPACITY_BY_TYPE[this._normalizeMoldType(moldType)] || 0;
    },

    _normalizeSimpleText(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    },

    _isWarehouseBackedHwBlank(blank) {
        if (!blank || typeof blank !== 'object') return false;
        if (blank.hw_form_source) return String(blank.hw_form_source) === 'warehouse';
        return Number(blank.warehouse_item_id || 0) > 0;
    },

    async _refreshBlankHardwareWarehouseItemIds() {
        if (typeof loadHwBlanks !== 'function') {
            this._blankHardwareWarehouseItemIds = new Set();
            return this._blankHardwareWarehouseItemIds;
        }
        try {
            const blanks = await loadHwBlanks();
            const ids = new Set(
                (Array.isArray(blanks) ? blanks : [])
                    .filter(blank => this._isWarehouseBackedHwBlank(blank))
                    .map(blank => Number(blank.warehouse_item_id || 0))
                    .filter(id => Number.isFinite(id) && id > 0)
            );
            this._blankHardwareWarehouseItemIds = ids;
            return ids;
        } catch (error) {
            console.warn('[Warehouse] Failed to load blank hardware ids', error);
            this._blankHardwareWarehouseItemIds = new Set();
            return this._blankHardwareWarehouseItemIds;
        }
    },

    _isBlankHardwareWarehouseItem(item) {
        const itemId = Number(item && item.id || 0);
        return Number.isFinite(itemId)
            && itemId > 0
            && this._blankHardwareWarehouseItemIds instanceof Set
            && this._blankHardwareWarehouseItemIds.has(itemId);
    },

    _buildBlankHardwareLowStockTaskDraft(item, people, areaIds) {
        const qty = Math.max(0, parseFloat(item && item.qty) || 0);
        const unit = String(item && item.unit || 'шт').trim() || 'шт';
        const category = WAREHOUSE_CATEGORIES.find(entry => entry.key === item.category);
        const categoryLabel = category ? category.label : 'Склад';
        const reporterId = Number(App && App.currentEmployeeId || 0) || null;
        const reporterName = (App && typeof App.getCurrentEmployeeName === 'function'
            ? App.getCurrentEmployeeName()
            : '') || 'Система';

        return {
            title: `Заказать бланковую фурнитуру «${String(item && item.name || 'Без названия').trim()}»`,
            description: [
                'На складе осталось меньше 1000 шт бланковой фурнитуры. Нужно оформить повторный заказ.',
                `Позиция: ${String(item && item.name || 'Без названия').trim()}`,
                item && item.sku ? `SKU: ${String(item.sku).trim()}` : '',
                `Категория: ${categoryLabel}`,
                `Текущий остаток: ${qty.toLocaleString('ru-RU')} ${unit}`,
                `Порог: ${BLANK_HARDWARE_LOW_STOCK_THRESHOLD.toLocaleString('ru-RU')} ${unit}`,
            ].filter(Boolean).join('\n'),
            status: 'incoming',
            priority: 'high',
            reporter_id: reporterId,
            reporter_name: reporterName,
            assignee_id: Number(people && people.anastasia && people.anastasia.id || 0) || null,
            assignee_name: String(people && people.anastasia && people.anastasia.name || 'Анастасия'),
            reviewer_id: null,
            reviewer_name: '',
            area_id: areaIds.warehouse || areaIds.general || null,
            order_id: null,
            project_id: null,
            china_purchase_id: null,
            warehouse_item_id: Number(item && item.id || 0) || null,
            primary_context_kind: 'area',
            due_date: this._todayYMD(),
            due_time: null,
            waiting_for_text: '',
        };
    },

    async _createBlankHardwareLowStockTasks(items) {
        if (!Array.isArray(items) || items.length === 0) return [];
        if (typeof saveWorkTask !== 'function') return [];

        const [employees, areas] = await Promise.all([
            typeof loadEmployees === 'function' ? loadEmployees().catch(() => []) : [],
            typeof loadWorkAreas === 'function' ? loadWorkAreas().catch(() => []) : [],
        ]);
        const people = this._resolveMoldUsageAlertPeople(employees);
        const areaIds = {
            warehouse: this._findAreaIdBySlug(areas, 'warehouse'),
            general: this._findAreaIdBySlug(areas, 'general'),
        };
        const createdTasks = [];

        for (const item of items) {
            const draft = this._buildBlankHardwareLowStockTaskDraft(item, people, areaIds);
            const saved = await saveWorkTask(draft, {
                actor_id: App && App.currentEmployeeId || null,
                actor_name: (App && typeof App.getCurrentEmployeeName === 'function'
                    ? App.getCurrentEmployeeName()
                    : '') || 'Система',
            });
            createdTasks.push(saved);
            if (saved && saved.assignee_id && typeof TaskEvents !== 'undefined' && TaskEvents && typeof TaskEvents.emit === 'function') {
                await TaskEvents.emit('task_assigned', {
                    task_id: saved.id,
                    project_id: saved.project_id || null,
                    assignee_id: saved.assignee_id,
                });
            }
        }

        return createdTasks;
    },

    async _reconcileBlankHardwareLowStockAlerts() {
        if (!Array.isArray(this.allItems) || this.allItems.length === 0) {
            return { changed: false, alertsCreated: 0 };
        }

        const itemsToAlert = [];
        let changed = false;
        this.allItems = this.allItems.map(rawItem => {
            if (!rawItem || typeof rawItem !== 'object') return rawItem;
            const item = { ...rawItem };
            const isBlankHardware = this._isBlankHardwareWarehouseItem(item);
            const qty = Math.max(0, parseFloat(item.qty) || 0);
            const isLow = isBlankHardware && qty < BLANK_HARDWARE_LOW_STOCK_THRESHOLD;
            const alreadyAlerted = item.blank_hardware_low_stock_alerted === true;

            if (isLow && !alreadyAlerted) {
                item.blank_hardware_low_stock_alerted = true;
                item.blank_hardware_low_stock_alert_qty = qty;
                item.blank_hardware_low_stock_alerted_at = new Date().toISOString();
                itemsToAlert.push(item);
                changed = true;
                return item;
            }

            if (!isLow && (
                alreadyAlerted
                || item.blank_hardware_low_stock_alert_qty != null
                || item.blank_hardware_low_stock_alerted_at
            )) {
                delete item.blank_hardware_low_stock_alerted;
                delete item.blank_hardware_low_stock_alert_qty;
                delete item.blank_hardware_low_stock_alerted_at;
                changed = true;
            }

            return item;
        });

        const createdTasks = await this._createBlankHardwareLowStockTasks(itemsToAlert);
        if (changed) {
            await saveWarehouseItems(this.allItems);
        }

        return {
            changed,
            alertsCreated: createdTasks.length,
        };
    },

    _parseMoldAlertedThresholds(item) {
        const raw = item && item.mold_alerted_thresholds;
        let values = [];
        if (Array.isArray(raw)) {
            values = raw;
        } else if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed) {
                try {
                    const parsed = JSON.parse(trimmed);
                    values = Array.isArray(parsed) ? parsed : trimmed.split(',');
                } catch (e) {
                    values = trimmed.split(',');
                }
            }
        }
        return Array.from(new Set(
            (values || [])
                .map(value => parseInt(value, 10))
                .filter(value => Number.isFinite(value) && value > 0)
        )).sort((a, b) => a - b);
    },

    _getCrossedMoldUsageThresholds(beforeUsed, afterUsed, alreadyAlerted) {
        const safeBefore = Math.max(0, parseFloat(beforeUsed) || 0);
        const safeAfter = Math.max(0, parseFloat(afterUsed) || 0);
        if (safeAfter <= safeBefore) return [];
        const alerted = new Set((alreadyAlerted || []).map(value => parseInt(value, 10)).filter(Boolean));
        const thresholds = [];
        const startStep = Math.floor(safeBefore / MOLD_USAGE_ALERT_STEP) + 1;
        const endStep = Math.floor(safeAfter / MOLD_USAGE_ALERT_STEP);
        for (let step = startStep; step <= endStep; step += 1) {
            const threshold = step * MOLD_USAGE_ALERT_STEP;
            if (!alerted.has(threshold)) thresholds.push(threshold);
        }
        return thresholds;
    },

    _findEmployeeByNames(employees, variants) {
        const normalizedVariants = (variants || []).map(value => this._normalizeSimpleText(value)).filter(Boolean);
        return (employees || []).find(employee => {
            const name = this._normalizeSimpleText(employee && employee.name);
            return normalizedVariants.some(variant => name.includes(variant));
        }) || null;
    },

    _resolveMoldUsageAlertPeople(employees) {
        const lesha = this._findEmployeeByNames(employees, ['леша', 'алеша', 'алексей'])
            || { id: MOLD_USAGE_ALERT_ASSIGNEE_FALLBACKS.lesha, name: 'Леша' };
        const anastasia = this._findEmployeeByNames(employees, ['анастасия'])
            || { id: MOLD_USAGE_ALERT_ASSIGNEE_FALLBACKS.anastasia, name: 'Анастасия' };
        return { lesha, anastasia };
    },

    _findAreaIdBySlug(areas, slug) {
        const normalizedSlug = this._normalizeSimpleText(slug);
        const area = (areas || []).find(entry => this._normalizeSimpleText(entry && entry.slug) === normalizedSlug);
        return Number(area && area.id || 0) || null;
    },

    _buildMoldUsageAlertContext(whItem, threshold, options = {}) {
        const moldName = String(whItem && whItem.name || 'Без названия').trim();
        const sku = String(whItem && whItem.sku || '').trim();
        const moldType = this._normalizeMoldType(whItem && whItem.mold_type);
        const total = parseFloat(whItem && whItem.mold_capacity_total) || 0;
        const used = parseFloat(whItem && whItem.mold_capacity_used) || 0;
        const remaining = total > 0 ? Math.max(0, total - used) : null;
        const linkedOrderId = Number(whItem && whItem.linked_order_id || 0) || null;
        const linkedOrderName = String(whItem && whItem.linked_order_name || '').trim() || this._getOrderNameById(linkedOrderId);
        const triggerOrderId = Number(options.orderId || 0) || null;
        const triggerOrderName = String(options.orderName || '').trim();
        const typeLabel = moldType === 'blank' ? 'Бланк / stock' : 'Клиентский';
        const thresholdText = Number(threshold || 0).toLocaleString('ru-RU');
        const totalText = total > 0 ? total.toLocaleString('ru-RU') : '—';
        const usedText = used.toLocaleString('ru-RU');
        const remainingText = remaining != null ? remaining.toLocaleString('ru-RU') : '—';
        const orderText = linkedOrderId ? `#${linkedOrderId}${linkedOrderName ? ` — ${linkedOrderName}` : ''}` : 'не привязан';
        const triggerOrderText = triggerOrderId
            ? `#${triggerOrderId}${triggerOrderName ? ` — ${triggerOrderName}` : ''}`
            : '';

        return {
            moldName,
            sku,
            moldType,
            typeLabel,
            total,
            used,
            remaining,
            linkedOrderId,
            linkedOrderName,
            thresholdText,
            totalText,
            usedText,
            remainingText,
            orderText,
            triggerOrderId,
            triggerOrderName,
            triggerOrderText,
        };
    },

    _buildMoldUsageAlertTaskDrafts(whItem, threshold, context, people, areaIds) {
        const commonLines = [
            `Молд: ${context.moldName}`,
            `Тип: ${context.typeLabel}`,
            context.sku ? `SKU: ${context.sku}` : '',
            `Использовано: ${context.usedText} / ${context.totalText}`,
            context.remaining != null ? `Осталось ресурса: ${context.remainingText}` : '',
            `Пересечён порог: ${context.thresholdText}`,
            `Связанный заказ: ${context.orderText}`,
            context.triggerOrderText ? `Триггерный заказ: ${context.triggerOrderText}` : '',
        ].filter(Boolean);
        const warehouseItemId = Number(whItem && whItem.id || 0) || null;
        const reporterId = Number(App && App.currentEmployeeId || 0) || null;
        const reporterName = (App && typeof App.getCurrentEmployeeName === 'function'
            ? App.getCurrentEmployeeName()
            : '') || 'Система';
        const orderId = context.linkedOrderId || context.triggerOrderId || null;
        const primaryContextKind = orderId ? 'order' : 'area';

        return [
            {
                title: `Проверить пригодность молда «${context.moldName}» · ${context.thresholdText}/${context.totalText}`,
                description: [
                    'Проверь, подходит ли mold_type для дальнейшего производства после очередного порога использования.',
                    ...commonLines,
                ].join('\n'),
                status: 'incoming',
                priority: 'high',
                reporter_id: reporterId,
                reporter_name: reporterName,
                assignee_id: Number(people && people.lesha && people.lesha.id || 0) || null,
                assignee_name: String(people && people.lesha && people.lesha.name || 'Леша'),
                reviewer_id: null,
                reviewer_name: '',
                area_id: areaIds.warehouse || areaIds.general || null,
                order_id: orderId,
                project_id: null,
                china_purchase_id: null,
                warehouse_item_id: warehouseItemId,
                primary_context_kind: primaryContextKind,
                due_date: this._todayYMD(),
                due_time: null,
                waiting_for_text: '',
            },
            {
                title: `Согласовать повтор молда «${context.moldName}» · ${context.thresholdText}/${context.totalText}`,
                description: [
                    'Согласуй с Лешей необходимость повтора молда и запусти заказ на новый mold, если текущий ресурс подходит к лимиту.',
                    ...commonLines,
                ].join('\n'),
                status: 'incoming',
                priority: 'high',
                reporter_id: reporterId,
                reporter_name: reporterName,
                assignee_id: Number(people && people.anastasia && people.anastasia.id || 0) || null,
                assignee_name: String(people && people.anastasia && people.anastasia.name || 'Анастасия'),
                reviewer_id: Number(people && people.lesha && people.lesha.id || 0) || null,
                reviewer_name: String(people && people.lesha && people.lesha.name || 'Леша'),
                area_id: areaIds.china || areaIds.general || null,
                order_id: orderId,
                project_id: null,
                china_purchase_id: null,
                warehouse_item_id: warehouseItemId,
                primary_context_kind: primaryContextKind,
                due_date: this._todayYMD(),
                due_time: null,
                waiting_for_text: '',
            },
        ];
    },

    async _createMoldUsageAlertTasks(alerts) {
        if (!Array.isArray(alerts) || alerts.length === 0) return [];
        if (typeof saveWorkTask !== 'function') return [];

        const [employees, areas] = await Promise.all([
            typeof loadEmployees === 'function' ? loadEmployees().catch(() => []) : [],
            typeof loadWorkAreas === 'function' ? loadWorkAreas().catch(() => []) : [],
        ]);
        const people = this._resolveMoldUsageAlertPeople(employees);
        const areaIds = {
            warehouse: this._findAreaIdBySlug(areas, 'warehouse'),
            china: this._findAreaIdBySlug(areas, 'china'),
            general: this._findAreaIdBySlug(areas, 'general'),
        };
        const createdTasks = [];

        for (const alert of alerts) {
            const context = this._buildMoldUsageAlertContext(alert.item, alert.threshold, {
                orderId: alert.orderId,
                orderName: alert.orderName,
            });
            const drafts = this._buildMoldUsageAlertTaskDrafts(alert.item, alert.threshold, context, people, areaIds);
            for (const draft of drafts) {
                const saved = await saveWorkTask(draft, {
                    actor_id: App && App.currentEmployeeId || null,
                    actor_name: (App && typeof App.getCurrentEmployeeName === 'function'
                        ? App.getCurrentEmployeeName()
                        : '') || 'Система',
                });
                createdTasks.push(saved);
                if (saved && saved.assignee_id && typeof TaskEvents !== 'undefined' && TaskEvents && typeof TaskEvents.emit === 'function') {
                    await TaskEvents.emit('task_assigned', {
                        task_id: saved.id,
                        project_id: saved.project_id || null,
                        assignee_id: saved.assignee_id,
                    });
                }
            }
        }

        return createdTasks;
    },

    _normalizeMoldLookupText(value) {
        return String(value || '')
            .toLowerCase()
            .trim()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ');
    },

    _buildAutoMoldSku(name, moldType, linkedOrderId) {
        const normalizedType = this._normalizeMoldType(moldType);
        const normalizedOrderId = Number(linkedOrderId || 0) || 0;
        if (normalizedType === 'customer' && normalizedOrderId) {
            return `MOLD-CUSTOM-${normalizedOrderId}`;
        }
        const slug = String(name || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}-]+/gu, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        const prefix = normalizedType === 'blank' ? 'MOLD-BLANK' : 'MOLD-CUSTOM';
        return slug ? `${prefix}-${slug}` : prefix;
    },

    _applyAutoMoldSku(item) {
        if (!item || !this._isMoldCategory(item.category)) return item;
        const currentSku = String(item.sku || '').trim();
        const isAutoSku = /^MOLD-(BLANK|CUSTOM)(-|$)/i.test(currentSku);
        if (currentSku && !isAutoSku) return item;
        item.sku = this._buildAutoMoldSku(item.name || '', item.mold_type, item.linked_order_id);
        return item;
    },

    _syncWarehouseFormMoldDerivedFields() {
        const categoryEl = document.getElementById('wh-f-category');
        const skuEl = document.getElementById('wh-f-sku');
        const nameEl = document.getElementById('wh-f-name');
        const typeEl = document.getElementById('wh-f-mold-type');
        const orderEl = document.getElementById('wh-f-mold-linked-order-id');
        if (!categoryEl || !skuEl) return;

        const isMold = this._isMoldCategory(categoryEl.value);
        skuEl.readOnly = isMold;
        skuEl.placeholder = isMold ? 'SKU назначится автоматически' : 'CR-RNG-030-VT';
        skuEl.title = isMold ? 'Для молдов SKU формируется автоматически' : '';

        if (!isMold) return;

        const normalizedType = this._normalizeMoldType(typeEl && typeEl.value);
        const linkedOrderId = normalizedType === 'customer'
            ? String(orderEl && orderEl.value || '').trim()
            : '';
        skuEl.value = this._buildAutoMoldSku(nameEl && nameEl.value || '', normalizedType, linkedOrderId);
    },

    _findBlankTemplateByMold(item) {
        const templates = Array.isArray(App && App.templates) ? App.templates : [];
        const explicitId = String(item && item.template_id || '').trim();
        if (explicitId) {
            const byId = templates.find(t => String(t && t.id || '') === explicitId);
            if (byId) return byId;
        }
        const normalizedName = this._normalizeMoldLookupText(item && item.name);
        if (!normalizedName) return null;
        return templates.find(t =>
            String(t && t.category || '').toLowerCase() === 'blank'
            && this._normalizeMoldLookupText(t && t.name) === normalizedName
        ) || null;
    },

    _resolveBlankMoldTemplateId(item) {
        const match = this._findBlankTemplateByMold(item);
        return match ? String(match.id) : '';
    },

    async _loadMoldOrders() {
        const orders = typeof loadOrders === 'function'
            ? await loadOrders({}).catch(() => [])
            : [];
        this.moldOrders = (orders || [])
            .filter(order => order && String(order.status || '') !== 'deleted')
            .sort((a, b) => Number(b && b.id || 0) - Number(a && a.id || 0));
        return this.moldOrders;
    },

    _getMoldOrders() {
        return Array.isArray(this.moldOrders) ? this.moldOrders : [];
    },

    _getOrderNameById(orderId) {
        const normalizedId = Number(orderId || 0) || 0;
        if (!normalizedId) return '';
        const order = this._getMoldOrders().find(entry => Number(entry && entry.id || 0) === normalizedId);
        return String(order && order.order_name || '').trim();
    },

    _buildMoldOrderOptionsHtml(selectedId) {
        const normalizedSelected = Number(selectedId || 0) || 0;
        const options = ['<option value="">Выберите заказ</option>'];
        let selectedPresent = false;
        this._getMoldOrders().forEach(order => {
            const id = Number(order && order.id || 0) || 0;
            if (!id) return;
            const label = `#${id} — ${this.esc(order.order_name || 'Без названия')}`;
            if (id === normalizedSelected) selectedPresent = true;
            options.push(`<option value="${id}"${id === normalizedSelected ? ' selected' : ''}>${label}</option>`);
        });
        if (normalizedSelected && !selectedPresent) {
            options.push(`<option value="${normalizedSelected}" selected>#${normalizedSelected}</option>`);
        }
        return options.join('');
    },

    _syncShipmentMoldDerivedFields(row) {
        if (!row || !this._isMoldCategory(row.category)) return row;
        row.mold_type = String(row.mold_type || '').trim()
            ? this._normalizeMoldType(row.mold_type)
            : (Number(row.linked_order_id || 0) ? 'customer' : 'blank');
        const currentTotal = parseFloat(row.mold_capacity_total || 0) || 0;
        const shouldResetToBlank = row.mold_type === 'blank' && currentTotal === this._defaultMoldCapacityTotal('customer');
        if (!currentTotal || shouldResetToBlank) {
            row.mold_capacity_total = this._defaultMoldCapacityTotal(row.mold_type);
        }
        if (row.mold_type === 'blank') {
            row.linked_order_id = '';
            row.linked_order_name = '';
            row.template_id = this._resolveBlankMoldTemplateId(row);
        } else if (row.linked_order_id) {
            row.linked_order_name = this._getOrderNameById(row.linked_order_id) || row.linked_order_name || '';
            row.template_id = '';
        } else {
            row.template_id = '';
        }
        this._applyAutoMoldSku(row);
        return row;
    },

    _todayYMD() {
        if (typeof App !== 'undefined' && App && typeof App.todayLocalYMD === 'function') {
            return App.todayLocalYMD();
        }
        return new Date().toISOString().slice(0, 10);
    },

    _plusDaysYMD(baseYmd, days) {
        const base = String(baseYmd || this._todayYMD());
        const parsed = new Date(`${base}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return '';
        parsed.setDate(parsed.getDate() + (parseInt(days, 10) || 0));
        return parsed.toISOString().slice(0, 10);
    },

    _formatDateCompact(value) {
        if (!value) return '—';
        try {
            return new Intl.DateTimeFormat('ru-RU').format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
        } catch (e) {
            return String(value || '—');
        }
    },

    _buildMoldMeta(item, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const isMold = this._isMoldCategory(item && item.category);
        if (!isMold) return null;

        const moldTypeRaw = opts.mold_type ?? item.mold_type;
        const moldType = String(moldTypeRaw || '').trim()
            ? this._normalizeMoldType(moldTypeRaw)
            : (Number(opts.linked_order_id ?? item.linked_order_id ?? 0) ? 'customer' : 'blank');
        const linkedOrderId = moldType === 'customer'
            ? (Number(opts.linked_order_id ?? item.linked_order_id ?? 0) || null)
            : null;
        const arrivedAt = String(opts.mold_arrived_at ?? item.mold_arrived_at ?? opts.receiptDate ?? this._todayYMD()).trim();
        const capacityTotalRaw = parseFloat(opts.mold_capacity_total ?? item.mold_capacity_total);
        const capacityUsedRaw = parseFloat(opts.mold_capacity_used ?? item.mold_capacity_used);
        const capacityTotal = capacityTotalRaw > 0 ? capacityTotalRaw : this._defaultMoldCapacityTotal(moldType);
        const capacityUsed = Math.max(0, capacityUsedRaw || 0);
        const storageUntilFallback = moldType === 'customer'
            ? this._plusDaysYMD(arrivedAt, 365)
            : '';
        const storageUntil = String(opts.mold_storage_until ?? item.mold_storage_until ?? storageUntilFallback).trim();
        const linkedOrderNameSource = opts.linked_order_name
            ?? item.linked_order_name
            ?? this._getOrderNameById(linkedOrderId)
            ?? '';
        const linkedOrderName = linkedOrderId ? String(linkedOrderNameSource).trim() : '';
        const templateId = moldType === 'blank'
            ? this._resolveBlankMoldTemplateId({ ...item, ...opts, mold_type: moldType })
            : '';

        return {
            mold_type: moldType,
            linked_order_id: linkedOrderId,
            linked_order_name: linkedOrderName,
            template_id: templateId,
            mold_capacity_total: capacityTotal,
            mold_capacity_used: capacityUsed,
            mold_arrived_at: arrivedAt,
            mold_storage_until: storageUntil,
        };
    },

    _renderMoldMeta(item) {
        const meta = this._buildMoldMeta(item);
        if (!meta) return '';

        const typeLabel = meta.mold_type === 'blank' ? 'Бланк / stock' : 'Клиентский';
        const total = parseFloat(meta.mold_capacity_total) || 0;
        const used = parseFloat(meta.mold_capacity_used) || 0;
        const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        const remaining = total > 0 ? total - used : null;
        const progressColor = total > 0 && used >= total
            ? '#dc2626'
            : (percent >= 75 ? '#f59e0b' : '#10b981');
        const linkedBits = [];
        linkedBits.push(`<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:999px;background:#fff;color:#7f1d1d;border:1px solid #fecaca;">${typeLabel}</span>`);
        if (meta.linked_order_id) {
            linkedBits.push(`<span>Заказ #${meta.linked_order_id}</span>`);
        }
        if (meta.mold_storage_until) {
            linkedBits.push(`<span>Хранить до: ${this._formatDateCompact(meta.mold_storage_until)}</span>`);
        }

        const capacityHtml = total > 0
            ? `<div style="margin-top:6px;">
                <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--text-muted);">
                    <span>Ресурс</span>
                    <span>${used.toLocaleString('ru-RU')} / ${total.toLocaleString('ru-RU')}${remaining != null ? ` · остаток ${Math.max(0, remaining).toLocaleString('ru-RU')}` : ''}</span>
                </div>
                <div style="height:6px;border-radius:999px;background:#fee2e2;overflow:hidden;margin-top:4px;">
                    <div style="width:${Math.max(0, Math.min(100, percent))}%;height:100%;background:${progressColor};"></div>
                </div>
            </div>`
            : '';

        return `<div style="margin-top:6px;font-size:10px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:6px;">${linkedBits.join('')}</div>${capacityHtml}`;
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
            const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category) || WAREHOUSE_CATEGORIES[WAREHOUSE_CATEGORIES.length - 1];
            const isLow = item.min_qty > 0 && item.qty < item.min_qty;
            const isOut = item.qty <= 0;
            const moldMetaHtml = this._renderMoldMeta(item);

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
            const qtyStep = this._warehouseQtyInputStep(item);

            // Color dropdown options
            const colorOpts = uniqueColors.map(c =>
                `<option value="${this.esc(c)}"${c === (item.color || '') ? ' selected' : ''}>${this.esc(c)}</option>`
            ).join('');

            return `<tr style="${isOut ? 'opacity:0.5;' : (isLow ? 'background:rgba(220,38,38,0.04);' : '')}">
                <td style="width:48px;">${photo}</td>
                <td>
                    <div style="font-weight:600;">${this.esc(item.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${this.esc(item.sku || '')}</div>
                    ${moldMetaHtml}
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
                    <input type="number" class="wh-inline-input text-right ${qtyClass}" value="${item.qty || 0}" min="0" step="${qtyStep}"
                        onchange="Warehouse.inlineQty(${item.id}, this.value, ${item.qty || 0})">
                </td>
                <td>
                    <input type="number" class="wh-inline-input text-right" value="${item.reserved_qty || 0}" min="0" max="${item.qty || 0}" step="${qtyStep}"
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

    onCategoryChange(categoryValue) {
        this._syncMoldFieldsVisibility(categoryValue);
        this._syncWarehouseFormMoldDerivedFields();
    },

    _syncMoldFieldsVisibility(categoryValue) {
        const wrapper = document.getElementById('wh-mold-fields');
        if (!wrapper) return;
        const isMold = this._isMoldCategory(categoryValue);
        wrapper.style.display = isMold ? '' : 'none';

        if (!isMold) return;
        const typeEl = document.getElementById('wh-f-mold-type');
        const orderWrap = document.getElementById('wh-f-mold-linked-order-wrap');
        const arrivedEl = document.getElementById('wh-f-mold-arrived-at');
        const storageEl = document.getElementById('wh-f-mold-storage-until');
        const storageWrap = document.getElementById('wh-f-mold-storage-until-wrap');
        const totalEl = document.getElementById('wh-f-mold-capacity-total');
        if (typeEl && !typeEl.value) typeEl.value = 'blank';
        const normalizedType = this._normalizeMoldType(typeEl && typeEl.value);
        if (arrivedEl && !arrivedEl.value) arrivedEl.value = this._todayYMD();
        if (orderWrap) orderWrap.style.display = normalizedType === 'customer' ? '' : 'none';
        if (storageWrap) storageWrap.style.display = normalizedType === 'customer' ? '' : 'none';
        if (totalEl) {
            const currentTotal = parseFloat(totalEl.value || 0) || 0;
            const customerDefault = this._defaultMoldCapacityTotal('customer');
            const shouldResetToBlank = normalizedType === 'blank' && (!currentTotal || currentTotal === customerDefault);
            if (!currentTotal || shouldResetToBlank) {
                totalEl.value = String(this._defaultMoldCapacityTotal(normalizedType));
            }
        }
        if (storageEl && !storageEl.value && normalizedType === 'customer') {
            storageEl.value = this._plusDaysYMD(arrivedEl && arrivedEl.value, 365);
        }
        if (storageEl && normalizedType !== 'customer') {
            storageEl.value = '';
        }
        this._syncWarehouseFormMoldDerivedFields();
    },

    async showAddForm() {
        this.editingId = null;
        this.clearForm();
        await this._loadMoldOrders();
        const orderSelect = document.getElementById('wh-f-mold-linked-order-id');
        if (orderSelect) orderSelect.innerHTML = this._buildMoldOrderOptionsHtml('');
        document.getElementById('wh-form-title').textContent = 'Новая позиция';
        document.getElementById('wh-delete-btn').style.display = 'none';
        document.getElementById('wh-reservations-section').innerHTML = '';
        this._syncMoldFieldsVisibility(document.getElementById('wh-f-category').value);
        this._syncWarehouseFormMoldDerivedFields();
        document.getElementById('wh-edit-form').style.display = '';
        document.getElementById('wh-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    async editItem(id) {
        const item = this.allItems.find(i => i.id === id);
        if (!item) return;
        await this._loadMoldOrders();
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
        document.getElementById('wh-f-mold-type').value = this._normalizeMoldType(item.mold_type);
        const orderSelect = document.getElementById('wh-f-mold-linked-order-id');
        if (orderSelect) {
            orderSelect.innerHTML = this._buildMoldOrderOptionsHtml(item.linked_order_id || '');
            orderSelect.value = item.linked_order_id || '';
        }
        document.getElementById('wh-f-mold-capacity-total').value = item.mold_capacity_total || '';
        document.getElementById('wh-f-mold-capacity-used').value = item.mold_capacity_used || 0;
        document.getElementById('wh-f-mold-arrived-at').value = item.mold_arrived_at || '';
        document.getElementById('wh-f-mold-storage-until').value = item.mold_storage_until || '';

        // Photo preview
        this._pendingThumbnail = item.photo_thumbnail || null;
        const photoFileInput = document.getElementById('wh-f-photo-file');
        if (photoFileInput) photoFileInput.value = '';
        this.updatePhotoPreview(item.photo_thumbnail || item.photo_url || '');

        document.getElementById('wh-delete-btn').style.display = '';
        this.renderItemReservations(id);
        this._syncMoldFieldsVisibility(item.category || 'other');
        this._syncWarehouseFormMoldDerivedFields();
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
        document.getElementById('wh-f-mold-type').value = 'blank';
        const orderSelect = document.getElementById('wh-f-mold-linked-order-id');
        if (orderSelect) {
            orderSelect.innerHTML = this._buildMoldOrderOptionsHtml('');
            orderSelect.value = '';
        }
        document.getElementById('wh-f-mold-capacity-total').value = '';
        document.getElementById('wh-f-mold-capacity-used').value = 0;
        document.getElementById('wh-f-mold-arrived-at').value = this._todayYMD();
        document.getElementById('wh-f-mold-storage-until').value = '';
        // Reset photo
        this._pendingThumbnail = null;
        const photoFileInput = document.getElementById('wh-f-photo-file');
        if (photoFileInput) photoFileInput.value = '';
        const preview = document.getElementById('wh-f-photo-preview');
        if (preview) preview.innerHTML = '<span style="font-size:24px;color:var(--text-muted);">📷</span>';
        this._syncMoldFieldsVisibility('carabiners');
        this._syncWarehouseFormMoldDerivedFields();
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

        if (this._isMoldCategory(item.category)) {
            const moldMeta = this._buildMoldMeta(item, {
                mold_type: document.getElementById('wh-f-mold-type').value,
                linked_order_id: document.getElementById('wh-f-mold-linked-order-id').value,
                mold_capacity_total: document.getElementById('wh-f-mold-capacity-total').value,
                mold_capacity_used: document.getElementById('wh-f-mold-capacity-used').value,
                mold_arrived_at: document.getElementById('wh-f-mold-arrived-at').value,
                mold_storage_until: document.getElementById('wh-f-mold-storage-until').value,
            });
            Object.assign(item, moldMeta);
            this._applyAutoMoldSku(item);
        }

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
        const normalizedItemId = Number(itemId || 0);
        const idx = items.findIndex(i => Number(i && i.id || 0) === normalizedItemId);
        if (idx < 0) {
            return {
                ok: false,
                requestedQtyChange: parseFloat(qtyChange) || 0,
                appliedQtyChange: 0,
                qtyBefore: null,
                qtyAfter: null,
                clamped: false,
            };
        }

        const item = items[idx];
        const requestedQtyChange = parseFloat(qtyChange) || 0;
        const qtyBefore = parseFloat(item.qty) || 0;
        const qtyAfter = Math.max(0, qtyBefore + requestedQtyChange);
        const appliedQtyChange = qtyAfter - qtyBefore;
        const clamped = Math.abs(appliedQtyChange - requestedQtyChange) > 1e-9;
        item.qty = qtyAfter;
        item.updated_at = new Date().toISOString();
        items[idx] = item;
        if (typeof saveWarehouseItem === 'function') {
            await saveWarehouseItem(item);
        } else {
            await saveWarehouseItems(items);
        }
        if (Array.isArray(this.allItems)) {
            const loadedIdx = this.allItems.findIndex(i => Number(i && i.id || 0) === normalizedItemId);
            if (loadedIdx >= 0) this.allItems[loadedIdx] = { ...this.allItems[loadedIdx], ...item };
        }

        // Record in history
        const history = await loadWarehouseHistory();
        const extraMeta = meta && typeof meta === 'object' ? { ...meta } : {};
        const historyOrderId = extraMeta && extraMeta.order_id ? extraMeta.order_id : null;
        if (extraMeta && Object.prototype.hasOwnProperty.call(extraMeta, 'order_id')) {
            delete extraMeta.order_id;
        }
        history.push({
            id: Date.now(),
            item_id: itemId,
            item_name: item.name || '',
            item_sku: item.sku || '',
            item_category: item.category || '',
            type: reason || 'adjustment',
            qty_change: appliedQtyChange,
            requested_qty_change: requestedQtyChange,
            qty_before: qtyBefore,
            qty_after: item.qty,
            unit_price: parseFloat(item.price_per_unit) || 0,
            total_cost_change: round2(Math.abs(appliedQtyChange) * (parseFloat(item.price_per_unit) || 0)),
            order_id: historyOrderId,
            order_name: orderName || '',
            notes: notes || '',
            clamped,
            created_at: new Date().toISOString(),
            created_by: manager || '',
            ...extraMeta,
        });
        await saveWarehouseHistory(history);
        return {
            ok: true,
            requestedQtyChange,
            appliedQtyChange,
            qtyBefore,
            qtyAfter: item.qty,
            clamped,
        };
    },

    async quickAdjust(itemId, delta) {
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', 'Быстрая корректировка', '');
        await this.load();
    },

    async promptAdjust(itemId) {
        const normalizedItemId = Number(itemId || 0);
        const item = this.allItems.find(i => Number(i && i.id || 0) === normalizedItemId);
        if (!item) return;
        const input = prompt(`Корректировка "${item.name}" (текущее: ${item.qty})\nВведите изменение (+10 или -5):`);
        if (input === null) return;
        const delta = parseFloat(input);
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
        const newQty = Math.max(0, this._parseWarehouseQty(newValueStr));
        const delta = newQty - (oldQty || 0);
        if (delta === 0) return;

        const inputEl = document.activeElement;
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', 'Ручная правка', '');
        this._inlineSaved(inputEl);
        await this.load();
    },

    async inlinePrice(itemId, newValueStr) {
        const normalizedItemId = Number(itemId || 0);
        const item = this.allItems.find(i => Number(i && i.id || 0) === normalizedItemId);
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
        const normalizedItemId = Number(itemId || 0);
        const item = this.allItems.find(i => Number(i && i.id || 0) === normalizedItemId);
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
        const normalizedItemId = Number(itemId || 0);
        const item = this.allItems.find(i => Number(i && i.id || 0) === normalizedItemId);
        if (!item) return;

        const newReserved = Math.max(0, this._parseWarehouseQty(newValueStr));
        const maxReserve = this._parseWarehouseQty(item.qty);
        const clampedReserve = Math.min(newReserved, maxReserve);
        const diff = clampedReserve - (oldReserved || 0);
        if (diff === 0) return;

        const inputEl = document.activeElement;
        const reservations = await loadWarehouseReservations();

        if (diff > 0) {
            // Add a manual reservation
            reservations.push({
                id: Date.now(),
                item_id: normalizedItemId,
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
                .filter(r => Number(r.item_id || 0) === normalizedItemId && r.status === 'active')
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
        const normalizedItemId = Number(itemId || 0);
        const item = this.allItems.find(i => Number(i && i.id || 0) === normalizedItemId);
        if (!item) return;

        const available = this.getAvailableQty(item);
        const orderName = prompt(`Резерв "${item.name}" (доступно: ${available})\nДля какого проекта/заказа?`);
        if (!orderName) return;

        const qtyStr = prompt(`Количество для резерва (макс: ${available}):`);
        const qty = this._parseWarehouseQty(qtyStr);
        if (!qty || qty <= 0) { App.toast('Неверное количество'); return; }
        if (qty > available) { App.toast(`Недостаточно! Доступно: ${available}`); return; }

        const reservations = await loadWarehouseReservations();
        reservations.push({
            id: Date.now(),
            item_id: normalizedItemId,
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
        const normalizedItemId = Number(item && item.id || 0);
        const activeRes = this.allReservations.filter(
            r => Number(r.item_id || 0) === normalizedItemId && r.status === 'active'
        );
        const reserved = activeRes.reduce((s, r) => s + this._parseWarehouseQty(r.qty), 0);
        return Math.max(0, this._parseWarehouseQty(item.qty) - reserved);
    },

    renderItemReservations(itemId) {
        const container = document.getElementById('wh-reservations-section');
        if (!container) return;
        const normalizedItemId = Number(itemId || 0);
        const activeRes = this.allReservations.filter(r => Number(r.item_id || 0) === normalizedItemId && r.status === 'active');
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
            qty_change: items.reduce((s, i) => s + this._parseWarehouseQty(i.qty), 0),
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

    async showAudit() {
        await this._refreshBlankHardwareWarehouseItemIds();
        this.auditDraft = this._loadAuditDraft();
        this._populateAuditCategoryFilter();
        const searchEl = document.getElementById('wh-audit-search');
        if (searchEl) searchEl.value = this.auditDraft.search || '';
        const form = document.getElementById('wh-audit-form');
        if (form) form.style.display = '';
        this.renderAuditTable(this.auditDraft.category || '');
        this._updateAuditDraftStatus();
        this._updateAuditSummary();
    },

    hideAudit() {
        const form = document.getElementById('wh-audit-form');
        if (form) form.style.display = 'none';
    },

    onAuditCategoryChange(category) {
        const draft = this._ensureAuditDraft();
        draft.category = String(category || '');
        this.saveAuditDraft(false);
        this.renderAuditTable(draft.category);
    },

    onAuditSearchChange(search) {
        const draft = this._ensureAuditDraft();
        draft.search = String(search || '');
        this.saveAuditDraft(false);
        this.renderAuditTable(draft.category || '');
    },

    renderAuditTable(category) {
        const draft = this._ensureAuditDraft();
        if (typeof category === 'string') {
            draft.category = category;
        }
        const selectedCategory = draft.category || '';
        const search = draft.search || '';
        const items = this._getAuditFilteredItems(selectedCategory, search);

        const container = document.getElementById('wh-audit-table');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div class="card" style="margin:0;"><p class="text-center text-muted">Нет позиций для инвентаризации по текущему фильтру</p></div>';
            this._updateAuditSummary();
            return;
        }

        container.innerHTML = `<div class="table-wrap wh-audit-table-wrap">
            <table>
                <thead><tr>
                    <th style="width:64px;">Фото</th>
                    <th>Категория</th>
                    <th>Название</th>
                    <th>Артикул</th>
                    <th class="text-right">В системе</th>
                    <th style="width:100px;">Факт</th>
                    <th class="text-right">Разница</th>
                    <th class="text-right">Расхождение ₽</th>
                </tr></thead>
                <tbody>${items.map(item => {
                    const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category);
                    const actualValue = this._getAuditStoredValue(item.id);
                    const rendered = this._renderAuditDiffMarkup(item, actualValue);
                    const photoSrc = item.photo_thumbnail || item.photo_url || '';
                    const safePhotoSrc = photoSrc ? (photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)) : '';
                    return `<tr>
                        <td>
                            ${safePhotoSrc
                                ? `<img src="${safePhotoSrc}" class="wh-audit-photo" alt="${this.esc(item.name || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="wh-audit-photo-placeholder" style="display:none;background:${cat?.color || '#f1f5f9'};color:${cat?.textColor || '#475569'};">${cat?.icon || '📦'}</div>`
                                : `<div class="wh-audit-photo-placeholder" style="background:${cat?.color || '#f1f5f9'};color:${cat?.textColor || '#475569'};">${cat?.icon || '📦'}</div>`}
                        </td>
                        <td><span class="wh-cat-badge" style="background:${cat?.color || '#f1f5f9'};color:${cat?.textColor || '#475569'};">${cat?.label || '?'}</span></td>
                        <td style="font-weight:600;">${this.esc(item.name)}</td>
                        <td style="color:var(--text-muted);font-size:11px;">${this.esc(item.sku || '')}</td>
                        <td class="text-right" style="font-weight:600;">${item.qty || 0}</td>
                        <td><input type="number" class="audit-input" data-id="${item.id}" data-system="${item.qty || 0}" value="${this.esc(actualValue)}" placeholder="${item.qty || 0}" style="width:88px;padding:4px;text-align:right;" oninput="Warehouse.onAuditInput(this)"></td>
                        <td class="${rendered.qtyClass}" id="audit-diff-${item.id}">${rendered.qty}</td>
                        <td class="${rendered.moneyClass}" id="audit-money-${item.id}">${rendered.money}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;
        this._updateAuditSummary();
    },

    onAuditInput(el) {
        const draft = this._ensureAuditDraft();
        const key = String(Number(el && el.dataset && el.dataset.id || 0) || (el && el.dataset && el.dataset.id) || '');
        if (!key) return;
        const rawValue = String(el && typeof el.value !== 'undefined' ? el.value : '').trim();
        if (rawValue === '') {
            delete draft.values[key];
        } else {
            draft.values[key] = rawValue;
        }
        this._persistAuditDraft();
        this._updateAuditRowDiff(key);
    },

    async saveAuditResults() {
        const draft = this._ensureAuditDraft();
        const changes = [];

        Object.entries(draft.values || {}).forEach(([rawId, rawValue]) => {
            if (rawValue === '' || rawValue == null) return;
            const itemId = Number(rawId || 0);
            const item = (this.allItems || []).find(entry => Number(entry && entry.id || 0) === itemId);
            if (!item) return;
            const meta = this._getAuditDiffMeta(item, rawValue);
            if (meta.diff == null || Math.abs(meta.diff) < 0.000001) return;
            changes.push({
                item,
                actualQty: meta.actualQty,
                diff: meta.diff,
                valueDiff: meta.valueDiff || 0,
            });
        });

        if (changes.length === 0) {
            App.toast('Нет изменений для сохранения');
            return;
        }

        const stats = this._getAuditSummaryStats();
        const confirmText = [
            `Принять инвентаризацию?`,
            `Позиции с расхождением: ${stats.changedPositions}`,
            `Недостача: ${this._formatMoney(stats.shortageValue)}`,
            `Излишек: ${this._formatMoney(stats.surplusValue)}`,
            `Нетто: ${stats.netValue >= 0 ? '+' : '−'}${this._formatMoney(Math.abs(stats.netValue))}`,
        ].join('\n');
        if (!confirm(confirmText)) return;

        const createdBy = App.getCurrentEmployeeName ? App.getCurrentEmployeeName() : '';
        const details = [];
        for (const change of changes) {
            await this.adjustStock(
                change.item.id,
                change.diff,
                'adjustment',
                '',
                `Инвентаризация: факт ${change.actualQty}, было ${parseFloat(change.item.qty) || 0}`,
                createdBy,
                { inventory_audit: true }
            );
            details.push(`${change.item.name}: ${change.diff > 0 ? '+' : ''}${change.diff} шт (${change.valueDiff >= 0 ? '+' : '−'}${this._formatMoney(Math.abs(change.valueDiff))})`);
        }

        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now(),
            item_id: 0,
            item_name: 'Инвентаризация склада',
            item_sku: '',
            item_category: '',
            type: 'inventory_audit',
            qty_change: Math.round(stats.netQty * 100) / 100,
            requested_qty_change: Math.round(stats.netQty * 100) / 100,
            qty_before: 0,
            qty_after: 0,
            unit_price: 0,
            total_cost_change: Math.round(stats.shortageValue * 100) / 100,
            order_id: null,
            order_name: '',
            notes: `Скорректировано ${stats.changedPositions} поз.; недостача ${this._formatMoney(stats.shortageValue)}, излишек ${this._formatMoney(stats.surplusValue)}, нетто ${stats.netValue >= 0 ? '+' : '−'}${this._formatMoney(Math.abs(stats.netValue))}. Детали: ${details.slice(0, 12).join('; ')}`,
            clamped: false,
            created_at: new Date().toISOString(),
            created_by: createdBy || '',
            inventory_shortage_value: Math.round(stats.shortageValue * 100) / 100,
            inventory_surplus_value: Math.round(stats.surplusValue * 100) / 100,
            inventory_net_value: Math.round(stats.netValue * 100) / 100,
            inventory_positions_changed: stats.changedPositions,
        });
        await saveWarehouseHistory(history);

        localStorage.removeItem(this._auditDraftStorageKey());
        this.auditDraft = this._defaultAuditDraft();
        this._updateAuditDraftStatus();
        this._updateAuditSummary();
        App.toast(`Инвентаризация принята: ${stats.changedPositions} поз., недостача ${this._formatMoney(stats.shortageValue)}`);
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

    _isProjectHardwareReserveStatus(status) {
        return ['sample', 'production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery'].includes(status);
    },

    _isProjectHardwareActionStatus(status) {
        return ['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery', 'completed'].includes(status);
    },

    _isProjectHardwareTrackedStatus(status) {
        return this._isProjectHardwareReserveStatus(status) || this._isProjectHardwareActionStatus(status);
    },

    _isProjectHardwareReservationSource(source) {
        return source === 'project_hardware' || source === 'order_calc';
    },

    _projectHardwareKey(orderId, itemId) {
        return `${Number(orderId) || 0}:${Number(itemId) || 0}`;
    },

    async _ensureProjectHardwareStateLoaded() {
        if (!this.projectHardwareState || typeof this.projectHardwareState !== 'object') {
            this.projectHardwareState = await loadProjectHardwareState();
        }
        if (!this.projectHardwareState || typeof this.projectHardwareState !== 'object') {
            this.projectHardwareState = { checks: {} };
        }
        if (!this.projectHardwareState.checks || typeof this.projectHardwareState.checks !== 'object') {
            this.projectHardwareState.checks = {};
        }
    },

    _isProjectHardwareReady(orderId, itemId) {
        const checks = (this.projectHardwareState && this.projectHardwareState.checks) || {};
        return !!checks[this._projectHardwareKey(orderId, itemId)];
    },

    _projectSupplyKindLabel(kind) {
        return String(kind || '').toLowerCase() === 'packaging'
            ? 'Упаковка'
            : 'Фурнитура';
    },

    async toggleProjectHardwareReady(orderId, itemId, checked) {
        const normalizedOrderId = Number(orderId || 0);
        const normalizedItemId = Number(itemId || 0);
        if (!normalizedOrderId || !normalizedItemId) return;

        await this._ensureProjectHardwareStateLoaded();
        const key = this._projectHardwareKey(normalizedOrderId, normalizedItemId);
        const wasChecked = !!this.projectHardwareState.checks[key];
        if (wasChecked === !!checked) return;

        const data = await loadOrder(normalizedOrderId);
        if (!data || !data.order) return;

        const order = data.order || {};
        const demand = this._getProjectHardwareDemandMap(data.items || []);
        const qty = demand.get(normalizedItemId) || 0;
        const managerName = App.getCurrentEmployeeName() || order.manager_name || '';
        const nowIso = new Date().toISOString();
        let reservations = await loadWarehouseReservations();
        const history = await loadWarehouseHistory();
        const historyDeltaMap = this._buildProjectHardwareHistoryDeltaMap(history);

        if (checked) {
            const consumedQty = this._getProjectHardwareConsumedQty(normalizedOrderId, normalizedItemId, historyDeltaMap);
            const missingQty = Math.max(0, qty - consumedQty);
            if (missingQty > 0) {
                const items = await loadWarehouseItems();
                const whItem = (items || []).find(i => Number(i.id) === normalizedItemId) || null;
                const stockQty = parseFloat(whItem && whItem.qty) || 0;
                if (stockQty + 0.000001 < missingQty) {
                    App.toast('Не удалось отметить как собрано: недостаточно остатка');
                    return;
                }

                const result = await this.adjustStock(
                    normalizedItemId,
                    -missingQty,
                    'deduction',
                    order.order_name || 'Заказ',
                    `Списание собранной позиции со склада: ${missingQty} шт`,
                    managerName,
                    {
                        order_id: normalizedOrderId,
                        project_hardware_flow: 'ready_toggle',
                    }
                );
                const appliedQty = Math.max(0, -(parseFloat(result && result.appliedQtyChange) || 0));
                if (!result || result.ok === false || appliedQty + 0.000001 < missingQty) {
                    if (appliedQty > 0) {
                        await this.adjustStock(
                            normalizedItemId,
                            appliedQty,
                            'addition',
                            order.order_name || 'Заказ',
                            `Откат неполного списания собранной позиции со склада: ${appliedQty} шт`,
                            managerName,
                            {
                                order_id: normalizedOrderId,
                                project_hardware_flow: 'ready_adjustment',
                            }
                        );
                    }
                    App.toast('Не удалось отметить как собрано: недостаточно остатка');
                    return;
                }
            }

            reservations.forEach(r => {
                if (r.status !== 'active') return;
                if (Number(r.order_id) !== normalizedOrderId) return;
                if (Number(r.item_id) !== normalizedItemId) return;
                if (!this._isProjectHardwareReservationSource(r.source)) return;
                r.status = 'released';
                r.released_at = nowIso;
            });

            this.projectHardwareState.checks[key] = true;
            App.toast(missingQty > 0 ? 'Позиция со склада списана' : 'Позиция уже была списана');
        } else {
            delete this.projectHardwareState.checks[key];
            const returnQty = this._getProjectHardwareConsumedQty(normalizedOrderId, normalizedItemId, historyDeltaMap);

            if (returnQty > 0) {
                await this.adjustStock(
                    normalizedItemId,
                    returnQty,
                    'addition',
                    order.order_name || 'Заказ',
                    `Возврат собранной позиции на склад: ${returnQty} шт`,
                    managerName,
                    {
                        order_id: normalizedOrderId,
                        project_hardware_flow: 'ready_toggle',
                    }
                );
            }

            if (qty > 0 && this._isProjectHardwareReserveStatus(order.status)) {
                const items = await loadWarehouseItems();
                const activeByItem = new Map();
                reservations.forEach(r => {
                    if (r.status !== 'active') return;
                    const resItemId = Number(r.item_id || 0);
                    if (!resItemId) return;
                    activeByItem.set(resItemId, (activeByItem.get(resItemId) || 0) + (parseFloat(r.qty) || 0));
                });

                const whItem = items.find(i => Number(i.id) === normalizedItemId);
                const stockQty = parseFloat(whItem && whItem.qty) || 0;
                const alreadyReserved = activeByItem.get(normalizedItemId) || 0;
                const available = Math.max(0, stockQty - alreadyReserved);
                const reserveQty = Math.min(qty, available);
                if (reserveQty > 0) {
                    reservations.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        item_id: normalizedItemId,
                        order_id: normalizedOrderId,
                        order_name: order.order_name || 'Заказ',
                        qty: reserveQty,
                        status: 'active',
                        source: 'project_hardware',
                        created_at: nowIso,
                        created_by: managerName || '',
                    });
                }
                if (reserveQty < qty) {
                    App.toast('Позиция возвращена не в полный резерв: недостаточно остатка');
                } else {
                    App.toast('Позиция возвращена в резерв');
                }
            } else if (returnQty > 0) {
                App.toast('Позиция возвращена на склад');
            } else {
                App.toast('Флаг сборки снят');
            }
        }

        this.projectHardwareState.updated_at = nowIso;
        this.projectHardwareState.updated_by = managerName;
        await saveProjectHardwareState(this.projectHardwareState);
        await saveWarehouseReservations(reservations);

        if (typeof Calculator !== 'undefined') {
            Calculator._whPickerData = null;
        }

        await this.load();
    },

    _collectWarehouseDemandFromOrderItems(items) {
        const grouped = new Map();
        const addDemandRow = (itemId, qty, name, materialType = 'hardware') => {
            const normalizedItemId = Number(itemId || 0);
            const normalizedQty = parseFloat(qty) || 0;
            if (!normalizedItemId || normalizedQty <= 0) return;

            const key = String(normalizedItemId);
            const prev = grouped.get(key);
            const normalizedName = name || '';
            if (!prev) {
                grouped.set(key, {
                    warehouse_item_id: normalizedItemId,
                    qty: normalizedQty,
                    names: normalizedName ? [normalizedName] : [],
                    material_type: materialType,
                });
                return;
            }

            prev.qty += normalizedQty;
            if (normalizedName && !prev.names.includes(normalizedName)) prev.names.push(normalizedName);
            if (prev.material_type !== materialType) prev.material_type = 'mixed';
            grouped.set(key, prev);
        };

        (items || []).forEach(item => {
            const itemType = String(item.item_type || '').toLowerCase();
            if (itemType === 'pendant' && typeof getPendantWarehouseDemandRows === 'function') {
                getPendantWarehouseDemandRows(item).forEach(row => {
                    addDemandRow(row.warehouse_item_id, row.qty, row.name, row.material_type || 'hardware');
                });
                return;
            }

            const isHardware = itemType === 'hardware';
            const isPackaging = itemType === 'packaging';
            if (!isHardware && !isPackaging) return;

            const src = String(
                item.source
                || (isHardware ? item.hardware_source : item.packaging_source)
                || ''
            ).toLowerCase();
            if (src !== 'warehouse') return;

            const itemId = Number(
                (
                    item.warehouse_item_id
                    ?? (isHardware ? item.hardware_warehouse_item_id : item.packaging_warehouse_item_id)
                    ?? 0
                )
            );
            const qty = parseFloat(
                item.quantity
                ?? (isHardware ? item.hardware_qty : item.packaging_qty)
                ?? item.qty
                ?? 0
            ) || 0;
            const name = item.product_name || item.name || '';
            const materialType = isPackaging ? 'packaging' : 'hardware';
            addDemandRow(itemId, qty, name, materialType);
        });
        return Array.from(grouped.values());
    },

    _getProjectHardwareDemandMap(items) {
        const demand = new Map();
        this._collectWarehouseDemandFromOrderItems(items).forEach(row => {
            const itemId = Number(row.warehouse_item_id || 0);
            const qty = parseFloat(row.qty) || 0;
            if (!itemId || qty <= 0) return;
            demand.set(itemId, qty);
        });
        return demand;
    },

    _getProjectHardwareHistoryFlow(entry) {
        const explicitFlow = String(entry && entry.project_hardware_flow || '').trim().toLowerCase();
        if (explicitFlow) return explicitFlow;

        const notes = String(entry && entry.notes || '').trim();
        if (!notes) return '';
        if (/^(Списание|Возврат на склад) при смене статуса:/i.test(notes)) return 'legacy_status';
        if (/^Автоисправление legacy-(?:списания|возврата) проектной позиции:/i.test(notes)) return 'legacy_status_repair';
        if (/^Откат неполного списания собранной позиции со склада:/i.test(notes)) return 'ready_adjustment';
        if (/^Корректировка собранной (?:фурнитуры|позиции):/i.test(notes)) return 'ready_delta';
        if (/^(Списание|Возврат(?: собранной)?(?: позиции| фурнитуры)?|Возврат собранной фурнитуры|Списание собранной фурнитуры)/i.test(notes)) {
            if (/собранн/i.test(notes)) return 'ready_toggle';
        }
        return '';
    },

    _isProjectHardwareStockHistoryFlow(flow) {
        return flow === 'ready_toggle'
            || flow === 'ready_delta'
            || flow === 'ready_adjustment';
    },

    _isProjectHardwareLegacyHistoryFlow(flow) {
        return flow === 'legacy_status'
            || flow === 'legacy_status_repair';
    },

    _buildProjectHardwareHistoryDeltaMap(history) {
        const deltaByKey = new Map();
        (history || []).forEach(entry => {
            const flow = this._getProjectHardwareHistoryFlow(entry);
            if (!this._isProjectHardwareStockHistoryFlow(flow)) return;
            const orderId = Number(entry.order_id || 0);
            const itemId = Number(entry.item_id || 0);
            const qtyChange = parseFloat(entry.qty_change || 0) || 0;
            if (!orderId || !itemId || qtyChange === 0) return;
            const key = this._projectHardwareKey(orderId, itemId);
            deltaByKey.set(key, (deltaByKey.get(key) || 0) + qtyChange);
        });
        return deltaByKey;
    },

    _getProjectHardwareHistoryNetDelta(orderId, itemId, historyDeltaMap) {
        const key = this._projectHardwareKey(orderId, itemId);
        return historyDeltaMap instanceof Map ? (parseFloat(historyDeltaMap.get(key)) || 0) : 0;
    },

    _getProjectHardwareConsumedQty(orderId, itemId, historyDeltaMap) {
        return Math.max(0, -this._getProjectHardwareHistoryNetDelta(orderId, itemId, historyDeltaMap));
    },

    _getProjectHardwareLegacyResidualDelta(orderId, itemId, history) {
        return (history || []).reduce((acc, entry) => {
            if (Number(entry.order_id || 0) !== Number(orderId || 0)) return acc;
            if (Number(entry.item_id || 0) !== Number(itemId || 0)) return acc;
            const flow = this._getProjectHardwareHistoryFlow(entry);
            if (!this._isProjectHardwareLegacyHistoryFlow(flow)) return acc;
            return acc + (parseFloat(entry.qty_change || 0) || 0);
        }, 0);
    },

    _hasProjectHardwareReadyEvidence(orderId, itemId, history) {
        return (history || []).some(entry => {
            if (Number(entry.order_id || 0) !== Number(orderId || 0)) return false;
            if (Number(entry.item_id || 0) !== Number(itemId || 0)) return false;
            const flow = this._getProjectHardwareHistoryFlow(entry);
            return this._isProjectHardwareStockHistoryFlow(flow);
        });
    },

    _hasProjectHardwareLegacyOnlyEvidence(orderId, itemId, history) {
        let hasLegacy = false;
        let hasValid = false;
        (history || []).forEach(entry => {
            if (Number(entry.order_id || 0) !== Number(orderId || 0)) return;
            if (Number(entry.item_id || 0) !== Number(itemId || 0)) return;
            const flow = this._getProjectHardwareHistoryFlow(entry);
            if (this._isProjectHardwareLegacyHistoryFlow(flow)) hasLegacy = true;
            if (this._isProjectHardwareStockHistoryFlow(flow)) hasValid = true;
        });
        return hasLegacy && !hasValid;
    },

    _isProjectHardwareHistoricallyReady(orderId, itemId, requiredQty, historyDeltaMap) {
        const qty = parseFloat(requiredQty || 0) || 0;
        if (!qty) return false;
        return this._getProjectHardwareConsumedQty(orderId, itemId, historyDeltaMap) >= (qty - 0.000001);
    },

    _hasProjectHardwareClampedShortfall(orderId, itemId, requiredQty, history, historyDeltaMap) {
        const qty = parseFloat(requiredQty || 0) || 0;
        if (!qty) return false;
        if (this._getProjectHardwareConsumedQty(orderId, itemId, historyDeltaMap) >= (qty - 0.000001)) {
            return false;
        }
        return (history || []).some(entry =>
            Number(entry.order_id || 0) === Number(orderId || 0)
            && Number(entry.item_id || 0) === Number(itemId || 0)
            && String(entry.type || '').toLowerCase() === 'deduction'
            && !!entry.clamped
            && /списание собранной/i.test(String(entry.notes || ''))
        );
    },

    _computeProjectHardwareReadyState(orderId, itemId, requiredQty, history, historyDeltaMap) {
        const savedReady = this._isProjectHardwareReady(orderId, itemId);
        const historicalReady = this._isProjectHardwareHistoricallyReady(orderId, itemId, requiredQty, historyDeltaMap);
        if (savedReady && this._hasProjectHardwareClampedShortfall(orderId, itemId, requiredQty, history, historyDeltaMap)) {
            return false;
        }
        if (savedReady && !historicalReady && this._hasProjectHardwareLegacyOnlyEvidence(orderId, itemId, history)) {
            return false;
        }
        return savedReady || historicalReady;
    },

    _buildMoldUsageHistoryDeltaMap(history) {
        const deltaByKey = new Map();
        (history || []).forEach(entry => {
            if (String(entry && entry.mold_flow || '') !== 'usage_completed') return;
            const orderId = Number(entry.order_id || 0);
            const itemId = Number(entry.item_id || 0);
            const usageChange = parseFloat(entry.mold_usage_change || 0) || 0;
            if (!orderId || !itemId || usageChange === 0) return;
            const key = this._projectHardwareKey(orderId, itemId);
            deltaByKey.set(key, (deltaByKey.get(key) || 0) + usageChange);
        });
        return deltaByKey;
    },

    _getMoldUsageNetDelta(orderId, itemId, historyDeltaMap) {
        const key = this._projectHardwareKey(orderId, itemId);
        return historyDeltaMap instanceof Map ? (parseFloat(historyDeltaMap.get(key)) || 0) : 0;
    },

    _getOrderMoldCandidates(orderId, orderItem, warehouseItems) {
        const items = Array.isArray(warehouseItems) ? warehouseItems : [];
        const templateId = String(orderItem && orderItem.template_id || '').trim();
        const isBlank = !!(orderItem && orderItem.is_blank_mold);
        const templateName = this._normalizeMoldLookupText(
            isBlank && templateId && Array.isArray(App && App.templates)
                ? ((App.templates.find(t => String(t && t.id || '') === templateId) || {}).name || '')
                : ''
        );
        return items
            .filter(item => {
                if (!this._isMoldCategory(item && item.category)) return false;
                if ((parseFloat(item.qty) || 0) <= 0) return false;
                const moldType = this._normalizeMoldType(item.mold_type);
                if (!isBlank) {
                    return moldType === 'customer' && Number(item.linked_order_id || 0) === Number(orderId || 0);
                }
                if (moldType !== 'blank') return false;
                if (templateId && String(item.template_id || '').trim() === templateId) return true;
                return !!templateName && this._normalizeMoldLookupText(item && item.name) === templateName;
            })
            .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    },

    _allocateOrderMoldUsage(orderId, orderItems, warehouseItems) {
        const allocations = new Map();
        (orderItems || []).forEach(item => {
            if (String(item && item.item_type || '').toLowerCase() !== 'product') return;
            const qty = parseFloat(item.quantity) || 0;
            if (qty <= 0) return;
            const candidates = this._getOrderMoldCandidates(orderId, item, warehouseItems);
            if (candidates.length === 0) return;

            let remainingDemand = qty;
            candidates.forEach(candidate => {
                if (remainingDemand <= 0) return;
                const itemId = Number(candidate.id || 0);
                if (!itemId) return;
                const total = parseFloat(candidate.mold_capacity_total) || 0;
                const used = parseFloat(candidate.mold_capacity_used) || 0;
                const alreadyAllocated = allocations.get(itemId) || 0;
                const remainingCapacity = total > 0 ? Math.max(0, total - used - alreadyAllocated) : remainingDemand;
                const chunk = total > 0 ? Math.min(remainingDemand, remainingCapacity) : remainingDemand;
                if (chunk <= 0) return;
                allocations.set(itemId, alreadyAllocated + chunk);
                remainingDemand -= chunk;
            });

            if (remainingDemand > 0) {
                const fallbackId = Number(candidates[0] && candidates[0].id || 0);
                if (fallbackId) {
                    allocations.set(fallbackId, (allocations.get(fallbackId) || 0) + remainingDemand);
                }
            }
        });
        return allocations;
    },

    async _syncOrderMoldUsageState({ orderId, orderName, managerName, status, currentItems }) {
        const normalizedOrderId = Number(orderId || 0);
        if (!normalizedOrderId) return;

        const [warehouseItems, history] = await Promise.all([
            loadWarehouseItems(),
            loadWarehouseHistory(),
        ]);
        const targetUsage = status === 'completed'
            ? this._allocateOrderMoldUsage(normalizedOrderId, currentItems || [], warehouseItems || [])
            : new Map();
        const historyDeltaMap = this._buildMoldUsageHistoryDeltaMap(history);
        const moldIds = new Set([
            ...Array.from(targetUsage.keys()),
            ...(history || [])
                .filter(entry => String(entry && entry.mold_flow || '') === 'usage_completed' && Number(entry.order_id || 0) === normalizedOrderId)
                .map(entry => Number(entry.item_id || 0))
                .filter(Boolean),
        ]);
        if (moldIds.size === 0) return;

        let changed = false;
        const updatedItems = Array.isArray(warehouseItems) ? [...warehouseItems] : [];
        const itemIndexById = new Map(updatedItems.map((item, index) => [Number(item.id || 0), index]));
        const newHistoryEntries = [];
        const usageAlerts = [];
        const nowIso = new Date().toISOString();

        moldIds.forEach(itemId => {
            const idx = itemIndexById.get(Number(itemId || 0));
            if (idx == null) return;
            const whItem = { ...updatedItems[idx] };
            const beforeUsed = Math.max(0, parseFloat(whItem.mold_capacity_used) || 0);
            const target = Math.max(0, parseFloat(targetUsage.get(itemId) || 0) || 0);
            const current = Math.max(0, this._getMoldUsageNetDelta(normalizedOrderId, itemId, historyDeltaMap));
            const delta = target - current;
            const afterUsed = Math.max(0, beforeUsed + delta);
            let alertsChanged = false;

            if (delta > 0) {
                const alertedThresholds = this._parseMoldAlertedThresholds(whItem);
                const crossedThresholds = this._getCrossedMoldUsageThresholds(beforeUsed, afterUsed, alertedThresholds);
                if (crossedThresholds.length > 0) {
                    whItem.mold_alerted_thresholds = Array.from(new Set([
                        ...alertedThresholds,
                        ...crossedThresholds,
                    ])).sort((a, b) => a - b);
                    alertsChanged = true;
                    crossedThresholds.forEach(threshold => {
                        usageAlerts.push({
                            item: { ...whItem, mold_capacity_used: afterUsed },
                            threshold,
                            orderId: normalizedOrderId,
                            orderName: orderName || '',
                        });
                    });
                }
            }

            if (Math.abs(delta) > 0.000001) {
                whItem.mold_capacity_used = afterUsed;
                whItem.updated_at = nowIso;
                newHistoryEntries.push({
                    id: Date.now() + Math.floor(Math.random() * 1000) + newHistoryEntries.length,
                    item_id: Number(itemId || 0),
                    item_name: whItem.name || '',
                    item_sku: whItem.sku || '',
                    item_category: whItem.category || '',
                    type: 'mold_usage',
                    qty_change: 0,
                    requested_qty_change: 0,
                    qty_before: parseFloat(whItem.qty) || 0,
                    qty_after: parseFloat(whItem.qty) || 0,
                    unit_price: parseFloat(whItem.price_per_unit) || 0,
                    total_cost_change: 0,
                    order_id: normalizedOrderId,
                    order_name: orderName || 'Заказ',
                    notes: delta > 0
                        ? `Списание ресурса молда: +${delta} шт`
                        : `Возврат ресурса молда: -${Math.abs(delta)} шт`,
                    clamped: false,
                    created_at: nowIso,
                    created_by: managerName || '',
                    mold_flow: 'usage_completed',
                    mold_usage_change: delta,
                    mold_usage_before: beforeUsed,
                    mold_usage_after: afterUsed,
                });
            }

            if (Math.abs(delta) > 0.000001 || alertsChanged) {
                updatedItems[idx] = whItem;
                changed = true;
            }
        });

        if (!changed) return;

        await saveWarehouseItems(updatedItems);
        await saveWarehouseHistory([...(history || []), ...newHistoryEntries]);
        if (usageAlerts.length > 0) {
            try {
                await this._createMoldUsageAlertTasks(usageAlerts);
            } catch (error) {
                console.error('[Warehouse] mold usage alert task creation failed:', error);
            }
        }
        this.allItems = updatedItems;
    },

    async _promoteOrdersForReceivedMolds(receivedItems, shipment) {
        const moldRows = (receivedItems || []).filter(item => this._isMoldCategory(item && item.category));
        if (moldRows.length === 0) return { changedOrders: 0, promotedOrders: 0 };

        const purchaseCache = new Map();
        const orderCache = new Map();
        let changedOrders = 0;
        let promotedOrders = 0;

        for (const row of moldRows) {
            const meta = await this._resolveShipmentMoldMeta(row, {
                purchaseCache,
                orderCache,
                receiptDate: shipment && (shipment.date || shipment.received_at || '') || '',
            });
            const linkedOrderId = Number(meta && meta.linked_order_id || 0);
            if (!linkedOrderId) continue;

            const detail = await this._getOrderCached(linkedOrderId, orderCache);
            if (!detail || !detail.order) continue;

            const updatedItems = (detail.items || []).map(item => {
                if (String(item && item.item_type || '').toLowerCase() !== 'product') return { ...item };
                if (item.is_blank_mold === true) return { ...item };
                if (item.base_mold_in_stock === true) return { ...item, warehouse_mold_item_id: row.warehouse_item_id || item.warehouse_mold_item_id || null };
                return {
                    ...item,
                    base_mold_in_stock: true,
                    warehouse_mold_item_id: row.warehouse_item_id || null,
                };
            });

            const hadChanges = JSON.stringify(updatedItems) !== JSON.stringify(detail.items || []);
            if (hadChanges) {
                await saveOrder(detail.order, updatedItems);
                detail.items = updatedItems;
                orderCache.set(linkedOrderId, detail);
                changedOrders += 1;
            }

            if (detail.order.status === 'sample') {
                await updateOrderStatus(linkedOrderId, 'production_casting');
                if (typeof Orders !== 'undefined' && Orders && typeof Orders.addChangeRecord === 'function') {
                    await Orders.addChangeRecord(linkedOrderId, {
                        field: 'status',
                        old_value: 'sample',
                        new_value: 'production_casting',
                        manager: App.getCurrentEmployeeName() || detail.order.manager_name || '',
                        description: 'Молд принят на склад, заказ переведён в продакшен',
                    });
                }
                if (typeof this.syncProjectHardwareOrderState === 'function') {
                    await this.syncProjectHardwareOrderState({
                        orderId: linkedOrderId,
                        orderName: detail.order.order_name || 'Заказ',
                        managerName: App.getCurrentEmployeeName() || detail.order.manager_name || '',
                        status: 'production_casting',
                        currentItems: updatedItems,
                        previousItems: updatedItems,
                    });
                }
                detail.order.status = 'production_casting';
                orderCache.set(linkedOrderId, detail);
                promotedOrders += 1;
            }
        }

        return { changedOrders, promotedOrders };
    },

    async _repairLegacyProjectHardwareMovements(rows, history, fallbackManagerName) {
        const uniqueRows = [];
        const seenKeys = new Set();
        (rows || []).forEach(row => {
            const orderId = Number(row && row.order_id || 0);
            const itemId = Number(row && row.item_id || 0);
            if (!orderId || !itemId) return;
            const key = this._projectHardwareKey(orderId, itemId);
            if (seenKeys.has(key)) return;
            seenKeys.add(key);
            uniqueRows.push({
                order_id: orderId,
                item_id: itemId,
                order_name: row.order_name || 'Заказ',
                manager_name: row.manager_name || fallbackManagerName || '',
            });
        });

        if (uniqueRows.length === 0) {
            return { repaired: false, history, warehouseItems: this.allItems || [] };
        }

        let repairedCount = 0;
        for (const row of uniqueRows) {
            const residualDelta = this._getProjectHardwareLegacyResidualDelta(row.order_id, row.item_id, history);
            if (Math.abs(residualDelta) <= 0.000001) continue;
            const repairDelta = -residualDelta;
            await this.adjustStock(
                row.item_id,
                repairDelta,
                repairDelta > 0 ? 'addition' : 'deduction',
                row.order_name || 'Заказ',
                repairDelta > 0
                    ? `Автоисправление legacy-списания проектной позиции: +${Math.abs(repairDelta)} шт`
                    : `Автоисправление legacy-возврата проектной позиции: -${Math.abs(repairDelta)} шт`,
                row.manager_name || fallbackManagerName || 'Система',
                {
                    order_id: row.order_id,
                    project_hardware_flow: 'legacy_status_repair',
                }
            );
            repairedCount += 1;
        }

        if (repairedCount === 0) {
            return { repaired: false, history, warehouseItems: this.allItems || [] };
        }

        return {
            repaired: true,
            repairedCount,
            history: await loadWarehouseHistory(),
            warehouseItems: await loadWarehouseItems(),
        };
    },

    _setProjectHardwareReadyFlag(orderId, itemId, isReady) {
        const key = this._projectHardwareKey(orderId, itemId);
        const current = !!(this.projectHardwareState && this.projectHardwareState.checks && this.projectHardwareState.checks[key]);
        if (current === !!isReady) return false;
        if (isReady) {
            this.projectHardwareState.checks[key] = true;
        } else {
            delete this.projectHardwareState.checks[key];
        }
        return true;
    },

    async reconcileProjectHardwareReservations() {
        await this._ensureProjectHardwareStateLoaded();

        const [orders, reservations, history] = await Promise.all([
            loadOrders(),
            loadWarehouseReservations(),
            loadWarehouseHistory(),
        ]);

        const activeOrders = (orders || []).filter(o => o.status !== 'deleted');
        const reserveOrders = activeOrders.filter(o => this._isProjectHardwareReserveStatus(o.status));
        const trackedOrders = activeOrders.filter(o => this._isProjectHardwareTrackedStatus(o.status));
        if (activeOrders.length === 0) {
            this.allReservations = reservations || [];
            return { reservationsChanged: false, stateChanged: false, shortage: false };
        }

        const details = await Promise.all(trackedOrders.map(o => loadOrder(o.id).catch(() => null)));
        const detailByOrderId = new Map();
        details.filter(Boolean).forEach(detail => {
            const order = detail.order || {};
            detailByOrderId.set(Number(order.id), detail);
        });

        const demandRows = [];
        trackedOrders.forEach(order => {
            const detail = detailByOrderId.get(Number(order.id));
            if (!detail) return;
            const demandRowsForOrder = this._collectWarehouseDemandFromOrderItems(detail.items || []);
            demandRowsForOrder.forEach(row => {
                const itemId = Number(row.warehouse_item_id || 0);
                const qty = parseFloat(row.qty) || 0;
                if (!itemId || qty <= 0) return;
                demandRows.push({
                    order_id: Number(order.id),
                    order_name: order.order_name || 'Заказ',
                    manager_name: order.manager_name || '',
                    status: order.status || '',
                    created_at: order.created_at || '',
                    item_id: Number(itemId),
                    qty,
                    ready: false,
                    material_type: row.material_type || 'hardware',
                });
            });
        });

        const repairResult = await this._repairLegacyProjectHardwareMovements(demandRows, history, App.getCurrentEmployeeName() || 'Система');
        const effectiveHistory = repairResult.repaired ? repairResult.history : history;
        if (repairResult.repaired && Array.isArray(repairResult.warehouseItems) && repairResult.warehouseItems.length > 0) {
            this.allItems = repairResult.warehouseItems;
        }

        const historyDeltaMap = this._buildProjectHardwareHistoryDeltaMap(effectiveHistory);
        const trackedKeys = new Set();
        let stateChanged = false;

        demandRows.forEach(row => {
            const key = this._projectHardwareKey(row.order_id, row.item_id);
            trackedKeys.add(key);
            const isReady = this._computeProjectHardwareReadyState(row.order_id, row.item_id, row.qty, effectiveHistory, historyDeltaMap);
            row.ready = isReady;
            if (this._setProjectHardwareReadyFlag(row.order_id, row.item_id, isReady)) {
                stateChanged = true;
            }
        });

        Object.keys(this.projectHardwareState.checks || {}).forEach(key => {
            if (trackedKeys.has(key)) return;
            delete this.projectHardwareState.checks[key];
            stateChanged = true;
        });

        const nowIso = new Date().toISOString();
        let reservationsChanged = false;
        let shortage = false;

        (reservations || []).forEach(r => {
            if (r.status !== 'active') return;
            const key = this._projectHardwareKey(r.order_id, r.item_id);
            const isAutoHardwareReservation = r.source === 'project_hardware'
                || (r.source === 'order_calc' && trackedKeys.has(key));
            if (!isAutoHardwareReservation) return;
            r.status = 'released';
            r.released_at = nowIso;
            reservationsChanged = true;
        });

        const activeByItem = new Map();
        (reservations || []).forEach(r => {
            if (r.status !== 'active') return;
            const itemId = Number(r.item_id || 0);
            if (!itemId) return;
            activeByItem.set(itemId, (activeByItem.get(itemId) || 0) + (parseFloat(r.qty) || 0));
        });

        const reservePriority = {
            sample: 0,
            production_casting: 1,
            production_printing: 2,
            production_hardware: 3,
            production_packaging: 4,
            in_production: 5,
            delivery: 6,
            completed: 7,
        };
        demandRows.sort((a, b) => {
            const prioDiff = (reservePriority[a.status] ?? 99) - (reservePriority[b.status] ?? 99);
            if (prioDiff !== 0) return prioDiff;
            const dateDiff = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
            if (dateDiff !== 0) return dateDiff;
            if (a.order_id !== b.order_id) return a.order_id - b.order_id;
            return a.item_id - b.item_id;
        });

        const warehouseById = new Map((this.allItems || []).map(item => [Number(item.id), item]));
        demandRows.forEach(row => {
            if (row.ready || row.qty <= 0 || !this._isProjectHardwareReserveStatus(row.status)) return;
            const whItem = warehouseById.get(Number(row.item_id));
            if (!whItem) return;

            const stockQty = parseFloat(whItem.qty) || 0;
            const alreadyReserved = activeByItem.get(Number(row.item_id)) || 0;
            const available = Math.max(0, stockQty - alreadyReserved);
            const reserveQty = Math.min(row.qty, available);

            if (reserveQty > 0) {
                reservations.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    item_id: Number(row.item_id),
                    order_id: Number(row.order_id),
                    order_name: row.order_name || 'Заказ',
                    qty: reserveQty,
                    status: 'active',
                    source: 'project_hardware',
                    created_at: nowIso,
                    created_by: row.manager_name || '',
                });
                activeByItem.set(Number(row.item_id), alreadyReserved + reserveQty);
                reservationsChanged = true;
            }

            if (reserveQty < row.qty) {
                shortage = true;
            }
        });

        if (stateChanged) {
            this.projectHardwareState.updated_at = nowIso;
            this.projectHardwareState.updated_by = App.getCurrentEmployeeName() || 'Система';
            await saveProjectHardwareState(this.projectHardwareState);
        }

        if (reservationsChanged) {
            await saveWarehouseReservations(reservations);
        }

        this.allReservations = reservations || [];

        if (typeof Calculator !== 'undefined') {
            Calculator._whPickerData = null;
        }

        return { reservationsChanged, stateChanged, shortage };
    },

    async syncProjectHardwareOrderState({ orderId, orderName, managerName, status, currentItems, previousItems }) {
        const normalizedOrderId = Number(orderId || 0);
        if (!normalizedOrderId) return;

        await this._ensureProjectHardwareStateLoaded();

        const currentDemand = this._getProjectHardwareDemandMap(currentItems || []);
        const previousDemand = this._getProjectHardwareDemandMap(previousItems || []);
        const itemIds = Array.from(new Set([
            ...Array.from(currentDemand.keys()),
            ...Array.from(previousDemand.keys()),
        ]));

        if (itemIds.length === 0) {
            await this._syncOrderMoldUsageState({
                orderId: normalizedOrderId,
                orderName,
                managerName,
                status,
                currentItems,
            });
            return;
        }

        const shouldReserve = this._isProjectHardwareReserveStatus(status);
        const nowIso = new Date().toISOString();
        const [reservations, history] = await Promise.all([
            loadWarehouseReservations(),
            loadWarehouseHistory(),
        ]);
        const repairRows = itemIds.map(itemId => ({
            order_id: normalizedOrderId,
            item_id: itemId,
            order_name: orderName || 'Заказ',
            manager_name: managerName || '',
        }));
        const repairResult = await this._repairLegacyProjectHardwareMovements(repairRows, history, managerName || '');
        const effectiveHistory = repairResult.repaired ? repairResult.history : history;
        if (repairResult.repaired && Array.isArray(repairResult.warehouseItems) && repairResult.warehouseItems.length > 0) {
            this.allItems = repairResult.warehouseItems;
        }
        const historyDeltaMap = this._buildProjectHardwareHistoryDeltaMap(effectiveHistory);
        let reservationsChanged = false;
        let shortage = false;
        let stateChanged = false;

        reservations.forEach(r => {
            if (r.status !== 'active') return;
            if (Number(r.order_id) !== normalizedOrderId) return;
            if (!itemIds.includes(Number(r.item_id || 0))) return;
            if (!this._isProjectHardwareReservationSource(r.source)) return;
            r.status = 'released';
            r.released_at = nowIso;
            reservationsChanged = true;
        });

        const activeByItem = new Map();
        reservations.forEach(r => {
            if (r.status !== 'active') return;
            const itemId = Number(r.item_id || 0);
            if (!itemId) return;
            activeByItem.set(itemId, (activeByItem.get(itemId) || 0) + (parseFloat(r.qty) || 0));
        });

        const warehouseItems = await loadWarehouseItems();
        const warehouseById = new Map((warehouseItems || []).map(item => [Number(item.id), item]));

        for (const itemId of itemIds) {
            const currentQty = currentDemand.get(itemId) || 0;
            const previousQty = previousDemand.get(itemId) || 0;
            const isReady = currentQty > 0
                ? this._computeProjectHardwareReadyState(normalizedOrderId, itemId, currentQty, effectiveHistory, historyDeltaMap)
                : false;

            if (this._setProjectHardwareReadyFlag(normalizedOrderId, itemId, currentQty > 0 && isReady)) {
                stateChanged = true;
            }

            if (isReady) {
                const delta = currentQty - previousQty;
                if (delta !== 0) {
                    await this.adjustStock(
                        itemId,
                        -delta,
                        delta > 0 ? 'deduction' : 'addition',
                        orderName || 'Заказ',
                        delta > 0
                            ? `Корректировка собранной фурнитуры: +${delta} шт`
                            : `Корректировка собранной фурнитуры: -${Math.abs(delta)} шт`,
                        managerName || '',
                        {
                            order_id: normalizedOrderId,
                            project_hardware_flow: 'ready_delta',
                        }
                    );
                }
                continue;
            }

            if (!shouldReserve || currentQty <= 0) continue;

            const whItem = warehouseById.get(itemId);
            if (!whItem) continue;

            const stockQty = parseFloat(whItem.qty) || 0;
            const alreadyReserved = activeByItem.get(itemId) || 0;
            const available = Math.max(0, stockQty - alreadyReserved);
            const reserveQty = Math.min(currentQty, available);

            if (reserveQty > 0) {
                reservations.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    item_id: itemId,
                    order_id: normalizedOrderId,
                    order_name: orderName || 'Заказ',
                    qty: reserveQty,
                    status: 'active',
                    source: 'project_hardware',
                    created_at: nowIso,
                    created_by: managerName || '',
                });
                activeByItem.set(itemId, alreadyReserved + reserveQty);
                reservationsChanged = true;
            }

            if (reserveQty < currentQty) {
                shortage = true;
            }
        }

        Object.keys(this.projectHardwareState.checks || {}).forEach(existingKey => {
            if (!existingKey.startsWith(`${normalizedOrderId}:`)) return;
            const [, itemIdStr] = existingKey.split(':');
            const itemId = Number(itemIdStr || 0);
            if (itemIds.includes(itemId)) return;
            delete this.projectHardwareState.checks[existingKey];
            stateChanged = true;
        });

        if (stateChanged) {
            this.projectHardwareState.updated_at = nowIso;
            this.projectHardwareState.updated_by = managerName || '';
            await saveProjectHardwareState(this.projectHardwareState);
        }

        if (reservationsChanged) {
            await saveWarehouseReservations(reservations);
        }

        this.allReservations = reservations;
        this.recalcReservations();
        if (typeof Calculator !== 'undefined') {
            Calculator._whPickerData = null;
        }

        if (shortage) {
            App.toast('Часть позиций со склада не встала в полный резерв: недостаточно остатка');
        }

        await this._syncOrderMoldUsageState({
            orderId: normalizedOrderId,
            orderName,
            managerName,
            status,
            currentItems,
        });
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
        const sampleOrders = (orders || []).filter(o => this._isSampleStatus(o.status));
        const productionOrders = (orders || []).filter(o => this._isProjectHardwareActionStatus(o.status));
        const [sampleDetails, productionDetails] = await Promise.all([
            Promise.all(sampleOrders.map(o => loadOrder(o.id).catch(() => null))),
            Promise.all(productionOrders.map(o => loadOrder(o.id).catch(() => null))),
        ]);
        if (token !== this._viewToken || this.currentView !== 'project-hardware') return;

        const sampleHardwareByOrder = new Map();
        sampleDetails.filter(Boolean).forEach(detail => {
            const order = detail.order || {};
            sampleHardwareByOrder.set(
                Number(order.id),
                new Set(Array.from(this._getProjectHardwareDemandMap(detail.items || []).keys()))
            );
        });

        // 1) Reserve block: active auto-reserves for orders in sample status.
        const reserveGrouped = new Map();
        (reservations || []).forEach(r => {
            if (r.status !== 'active' || !this._isProjectHardwareReservationSource(r.source)) return;
            const order = byOrderId.get(Number(r.order_id));
            if (!order || !this._isSampleStatus(order.status)) return;
            if (r.source === 'order_calc') {
                const legacyHw = sampleHardwareByOrder.get(Number(r.order_id));
                if (!legacyHw || !legacyHw.has(Number(r.item_id))) return;
            }
            const item = byItemId.get(Number(r.item_id));
            const key = `${Number(r.order_id)}:${Number(r.item_id)}`;
            const current = reserveGrouped.get(key) || {
                order_id: Number(r.order_id),
                order_name: order.order_name || r.order_name || 'Заказ',
                manager: order.manager_name || '',
                item_id: Number(r.item_id),
                item_name: (item && item.name) || r.item_name || 'Фурнитура',
                item_sku: (item && item.sku) || '',
                item_kind: this._projectSupplyKindLabel((item && item.category) || 'hardware'),
                qty: 0,
            };
            current.qty += parseFloat(r.qty) || 0;
            reserveGrouped.set(key, current);
        });
        const reserveRows = Array.from(reserveGrouped.values());
        reserveRows.sort((a, b) => String(a.order_name).localeCompare(String(b.order_name), 'ru'));

        // 2) Production block: warehouse hardware demand for production-stage orders.
        const productionRows = [];
        productionDetails.filter(Boolean).forEach(detail => {
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
                    item_kind: this._projectSupplyKindLabel(d.material_type || (item && item.category) || 'hardware'),
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
                                <tr><th>Комплектующая</th><th class="text-right">Резерв</th></tr>
                            </thead>
                            <tbody>
                                ${o.items.map(r => `<tr>
                                    <td>
                                        <div>${this.esc(r.item_name)}</div>
                                        <div style="font-size:11px;color:var(--text-muted);">${this.esc(r.item_kind || 'Фурнитура')}</div>
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

        const activeProductionOrders = [];
        const collectedProductionOrders = [];
        const archivedCollectedOrders = [];
        productionOrdersGrouped.forEach(order => {
            const progress = orderProgress.get(order.order_id) || { total: 0, ready: 0 };
            const done = progress.total > 0 && progress.ready === progress.total;
            if (done) {
                if (order.status === 'completed') {
                    archivedCollectedOrders.push(order);
                } else {
                    collectedProductionOrders.push(order);
                }
            } else {
                activeProductionOrders.push(order);
            }
        });

        const renderProjectHardwareOrders = (ordersList, mode = 'active') => ordersList.length
            ? `<div style="display:grid;gap:10px;">${ordersList.map(o => {
                const p = orderProgress.get(o.order_id) || { total: 0, ready: 0 };
                const done = p.total > 0 && p.ready === p.total;
                const badge = done
                    ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">готово</span>'
                    : '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;">не готово</span>';
                const progressText = done
                    ? `Собрано ${p.ready} из ${p.total}`
                    : `Собрано ${p.ready} из ${p.total}`;
                return `
                <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--bg);border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:700;">${this.esc(o.order_name)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">
                                ${this.esc(App.statusLabel(o.status))} · ${badge} · ${this.esc(progressText)} · Менеджер: ${this.esc(o.manager || '—')}
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${o.order_id})">Открыть</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Комплектующая</th><th class="text-right">Нужно</th><th>Собрано</th></tr>
                            </thead>
                            <tbody>
                                ${o.items.map(r => `<tr>
                                    <td>
                                        <div>${this.esc(r.item_name)}</div>
                                        <div style="font-size:11px;color:var(--text-muted);">${this.esc(r.item_kind || 'Фурнитура')}</div>
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
            : (mode === 'collected'
                ? '<p class="text-muted">Пока нет полностью собранных заказов.</p>'
                : '<p class="text-muted">Нет позиций со склада для заказов, которые нужно собрать.</p>');

        const activeProductionHtml = renderProjectHardwareOrders(activeProductionOrders, 'active');
        const collectedProductionHtml = renderProjectHardwareOrders(collectedProductionOrders, 'collected');
        const archivedCollectedNote = archivedCollectedOrders.length > 0
            ? `<div style="font-size:12px;color:var(--text-secondary);">Завершенные заказы скрыты автоматически: ${archivedCollectedOrders.length}</div>`
            : '';
        const collectedSummary = collectedProductionOrders.length === 1
            ? '1 заказ'
            : `${collectedProductionOrders.length} заказ${collectedProductionOrders.length >= 2 && collectedProductionOrders.length <= 4 ? 'а' : 'ов'}`;
        const collectedSectionHtml = collectedProductionOrders.length > 0
            ? `
            <details class="card" style="margin-top:12px;">
                <summary style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;list-style:none;">
                    <div>
                        <h3 style="margin:0;">Уже собрано</h3>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${this.esc(collectedSummary)} · скрыто из активного списка</div>
                        ${archivedCollectedNote}
                    </div>
                    <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">Показать</span>
                </summary>
                <div style="padding:0 0 12px;">
                    ${collectedProductionHtml}
                </div>
            </details>`
            : '';

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
                    <h3>Фурнитура и упаковка для проектов (к сборке)</h3>
                </div>
                ${activeProductionHtml}
            </div>
            ${collectedSectionHtml}
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
        await this._loadMoldOrders();
        const categoryOptions = WAREHOUSE_CATEGORIES.map(c =>
            `<option value="${c.key}">${c.icon} ${c.label}</option>`
        ).join('');

        const rows = this.shipmentItems.map((item, idx) => {
            this._syncShipmentMoldDerivedFields(item);
            const selectOptions = this.buildPickerOptions(grouped, item.warehouse_item_id, true);
            const simpleSelectHtml = `<select onchange="Warehouse.onShipmentItemSelect(${idx}, this.value)" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;">
                ${selectOptions}
            </select>`;
            const photoSrc = item.photo_thumbnail || item.photo_url || '';
            const photoPreview = photoSrc
                ? `<img src="${this.esc(photoSrc)}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="width:36px;height:36px;display:none;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:14px;">📷</span>`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:14px;">📷</span>`;

            const moldFieldsHtml = item.source === 'new' && this._isMoldCategory(item.category)
                ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-top:6px;padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(239,68,68,0.04);">
                    <select onchange="Warehouse.onShipmentItemField(${idx}, 'mold_type', this.value)" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        <option value="blank"${this._normalizeMoldType(item.mold_type) === 'blank' ? ' selected' : ''}>Бланк / stock</option>
                        <option value="customer"${this._normalizeMoldType(item.mold_type) === 'customer' ? ' selected' : ''}>Клиентский</option>
                    </select>
                    ${this._normalizeMoldType(item.mold_type) === 'customer'
                        ? `<select onchange="Warehouse.onShipmentItemField(${idx}, 'linked_order_id', this.value)" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                            ${this._buildMoldOrderOptionsHtml(item.linked_order_id || '')}
                        </select>`
                        : '<div style="display:flex;align-items:center;padding:4px 6px;border:1px dashed var(--border);border-radius:4px;font-size:12px;color:var(--text-muted);">SKU назначится автоматически</div>'
                    }
                    <input type="number" value="${item.mold_capacity_total || this._defaultMoldCapacityTotal(item.mold_type)}" min="0" step="1" placeholder="Ресурс всего" oninput="Warehouse.onShipmentItemField(${idx}, 'mold_capacity_total', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                </div>`
                : '';
            const skuCellHtml = item.source === 'new' && this._isMoldCategory(item.category)
                ? `<div style="display:flex;align-items:center;padding:4px 6px;border:1px dashed var(--border);border-radius:4px;font-size:12px;color:var(--text-muted);background:#fff;">${this.esc(item.sku || this._buildAutoMoldSku(item.name || '', item.mold_type, item.linked_order_id))}</div>`
                : `<input type="text" value="${this.esc(item.sku || '')}" placeholder="SKU" oninput="Warehouse.onShipmentItemField(${idx}, 'sku', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">`;

            const itemSourceCell = item.source === 'new'
                ? `<div>
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button class="btn btn-sm ${item.source === 'existing' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'existing')">Со склада</button>
                        <button class="btn btn-sm ${item.source === 'new' ? 'btn-primary' : 'btn-outline'}" type="button" style="padding:2px 8px;font-size:11px;" onclick="Warehouse.setShipmentItemSource(${idx}, 'new')">Новая</button>
                    </div>
                    <div style="display:grid;grid-template-columns:minmax(200px,1fr) 120px;gap:6px;">
                        <input type="text" value="${this.esc(item.name || '')}" placeholder="Название позиции" oninput="Warehouse.onShipmentItemField(${idx}, 'name', this.value)" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;">
                        ${skuCellHtml}
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
                    ${moldFieldsHtml}
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
            this._syncShipmentMoldDerivedFields(item);
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
            shItem.mold_type = '';
            shItem.linked_order_id = '';
            shItem.linked_order_name = '';
            shItem.template_id = '';
            shItem.mold_capacity_total = 0;
            shItem.mold_capacity_used = 0;
            shItem.mold_arrived_at = '';
            shItem.mold_storage_until = '';
        } else {
            const whItem = this.allItems.find(i => Number(i && i.id || 0) === itemId);
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
                shItem.mold_type = whItem.mold_type || '';
                shItem.linked_order_id = whItem.linked_order_id || '';
                shItem.linked_order_name = whItem.linked_order_name || '';
                shItem.template_id = whItem.template_id || '';
                shItem.mold_capacity_total = whItem.mold_capacity_total || 0;
                shItem.mold_capacity_used = whItem.mold_capacity_used || 0;
                shItem.mold_arrived_at = whItem.mold_arrived_at || '';
                shItem.mold_storage_until = whItem.mold_storage_until || '';
            }
        }
        this._syncShipmentMoldDerivedFields(shItem);
        this.recalcShipmentValues();
    },

    onShipmentItemField(idx, field, value) {
        const numericFields = new Set(['qty_received', 'weight_grams', 'purchase_price_cny', 'purchase_price_rub', 'delivery_allocated', 'total_cost_per_unit']);
        this.shipmentItems[idx][field] = numericFields.has(field) ? (parseFloat(value) || 0) : String(value || '');
        const row = this.shipmentItems[idx];
        if (field === 'linked_order_id') {
            row.linked_order_name = this._getOrderNameById(value) || '';
        }
        this._syncShipmentMoldDerivedFields(row);
        this.recalcShipmentValues();
        if (field === 'category' || field === 'mold_type' || field === 'linked_order_id' || field === 'name') {
            this.renderShipmentItemsTable();
        }
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
        const existingShipment = this.editingShipmentId
            ? this.allShipments.find(s => s.id === this.editingShipmentId)
            : null;
        const derivedChinaPurchaseIds = [...new Set(
            this.shipmentItems
                .map(item => parseInt(item.china_purchase_id, 10))
                .filter(Boolean)
        )];
        const chinaPurchaseIds = derivedChinaPurchaseIds.length
            ? derivedChinaPurchaseIds
            : (Array.isArray(existingShipment?.china_purchase_ids) ? existingShipment.china_purchase_ids : []);
        const shipmentSource = existingShipment?.source || (chinaPurchaseIds.length ? 'china_consolidation' : '');

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
            customs_fees: existingShipment?.customs_fees || 0,
            total_delivery: parseFloat(document.getElementById('wh-sh-total-delivery').value) || 0,
            pricing_mode: document.getElementById('wh-sh-pricing-mode').value || 'weighted_avg',
            items: JSON.parse(JSON.stringify(this.shipmentItems)),
            total_weight_grams: this.shipmentItems.reduce((s, i) => s + (i.weight_grams || 0), 0),
            notes: document.getElementById('wh-sh-notes').value.trim(),
            source: shipmentSource || undefined,
            china_purchase_ids: chinaPurchaseIds,
            china_box_status: existingShipment?.china_box_status || (shipmentSource === 'china_consolidation' ? (existingShipment?.status || 'draft') : undefined),
            china_delivery_type: existingShipment?.china_delivery_type || '',
            china_estimated_days: existingShipment?.china_estimated_days || 0,
            china_tracking_number: existingShipment?.china_tracking_number || '',
            china_delivery_estimated_usd: existingShipment?.china_delivery_estimated_usd || 0,
            waybill_pdf_name: existingShipment?.waybill_pdf_name || '',
            waybill_pdf_data: existingShipment?.waybill_pdf_data || '',
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
        const purchaseCache = new Map();
        const orderCache = new Map();

        // Ensure all "new" items are matched with existing stock or created once.
        for (const shItem of validItemsRaw) {
            if (shItem.warehouse_item_id) continue;
            if (this._isMoldCategory(shItem.category)) {
                const moldMeta = await this._resolveShipmentMoldMeta(shItem, {
                    purchaseCache,
                    orderCache,
                    receiptDate: data.date || data.received_at || '',
                });
                if (moldMeta) {
                    Object.assign(shItem, moldMeta);
                    this._applyAutoMoldSku(shItem);
                }
            }
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
                notes: this._isMoldCategory(shItem.category)
                    ? 'Молд создан автоматически из приёмки Китая'
                    : 'Создано автоматически из приёмки Китая',
            };
            if (this._isMoldCategory(shItem.category)) {
                Object.assign(newItem, this._mergeMoldMetaIntoItem(newItem, shItem));
            }
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

            let after = itemsAfter[idx];
            if (this._isMoldCategory(after.category) || this._isMoldCategory(shItem.category)) {
                after = this._mergeMoldMetaIntoItem(after, shItem);
                itemsAfter[idx] = after;
            }
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

        const moldResult = await this._promoteOrdersForReceivedMolds(validItems, data);

        App.toast(isRepost
            ? `Приёмка перепроведена: ${validItems.length} позиций обновлено`
            : `Приёмка завершена: ${validItems.length} позиций на складе`);
        if (moldResult && moldResult.promotedOrders > 0) {
            App.toast(`Молды приняты: ${moldResult.promotedOrders} заказ(а) переведены в продакшен`);
        }
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

    _normalizeReadyGoodsLocation(value) {
        return String(value || '').trim().toLowerCase() === 'partner' ? 'partner' : 'our';
    },

    _readyGoodsLocationLabel(value) {
        return this._normalizeReadyGoodsLocation(value) === 'partner' ? 'Склад партнёра' : 'Наш склад';
    },

    _readyGoodsLocationEmoji(value) {
        return this._normalizeReadyGoodsLocation(value) === 'partner' ? '🤝' : '🏠';
    },

    _normalizeReadyGoodsItem(item) {
        if (!item || typeof item !== 'object') return item;
        return {
            ...item,
            location_type: this._normalizeReadyGoodsLocation(item.location_type),
        };
    },

    _normalizeSalesRecord(record) {
        if (!record || typeof record !== 'object') return record;
        return {
            ...record,
            location_type: this._normalizeReadyGoodsLocation(record.location_type),
        };
    },

    _resolveReadyGoodsLocation(orderData = null) {
        const candidates = [
            orderData?.order?.ready_goods_location,
            orderData?.order?.warehouse_location,
            orderData?.order?.stock_location,
            orderData?.order?.delivery_stock_location,
            orderData?.order?.partner_stock ? 'partner' : '',
        ];
        const found = candidates.find(value => String(value || '').trim());
        return this._normalizeReadyGoodsLocation(found);
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

        const rg = (await loadReadyGoods()).map(item => this._normalizeReadyGoodsItem(item));
        const salesRecords = (await loadSalesRecords()).map(item => this._normalizeSalesRecord(item));
        const sourceStatus = typeof getReadyGoodsSourceStatus === 'function' ? getReadyGoodsSourceStatus() : null;
        const sourceItems = sourceStatus ? [sourceStatus.ready_goods, sourceStatus.ready_goods_history, sourceStatus.sales_records].filter(Boolean) : [];
        const usesSharedSource = sourceItems.length > 0 && sourceItems.every(item => item.source === 'shared-settings');
        const readyGoodsAvailable = usesSharedSource;
        const sourceHtml = sourceItems.length > 0
            ? `<div style="margin-bottom:12px;padding:12px 14px;border-radius:12px;border:1px solid ${usesSharedSource ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'};background:${usesSharedSource ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)'};">
                <div style="font-weight:700;margin-bottom:4px;">${usesSharedSource ? 'Источник готовой продукции: общая база' : 'Готовая продукция временно недоступна'}</div>
                <div style="font-size:12px;color:var(--text-muted);line-height:1.45;">
                    ${usesSharedSource
                        ? 'Остатки, история готовой продукции и продажи читаются из канонического shared-хранилища Supabase settings.'
                        : 'Локальный кэш для готовой продукции больше не используется. Раздел доступен только при live-синхронизации через shared Supabase settings, чтобы у всех сотрудников были одни и те же остатки.'}
                </div>
            </div>`
            : '';

        // Stats
        const positiveRg = rg.filter(i => (parseFloat(i.qty) || 0) > 0);
        const ourItems = positiveRg.filter(item => this._normalizeReadyGoodsLocation(item.location_type) === 'our');
        const partnerItems = positiveRg.filter(item => this._normalizeReadyGoodsLocation(item.location_type) === 'partner');
        const totalQty = positiveRg.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const totalValue = positiveRg.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.cost_per_unit) || 0), 0);
        const ourQty = ourItems.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const ourValue = ourItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.cost_per_unit) || 0), 0);
        const partnerQty = partnerItems.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const partnerValue = partnerItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.cost_per_unit) || 0), 0);
        const totalSalesRevenue = salesRecords.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
        const totalSalesCost = salesRecords.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.cost_per_unit) || 0), 0);
        const totalProfit = totalSalesRevenue - totalSalesCost;

        let html = `
        ${sourceHtml}
        <div class="stats-grid" style="margin-bottom:16px;">
            <div class="stat-card">
                <div class="stat-label">Наш склад (шт)</div>
                <div class="stat-value">${ourQty}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Стоимость на нашем складе</div>
                <div class="stat-value">${this._formatMoney(ourValue)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Склад партнёра (шт)</div>
                <div class="stat-value">${partnerQty}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Стоимость у партнёра</div>
                <div class="stat-value">${this._formatMoney(partnerValue)}</div>
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
        <div style="font-size:12px;color:var(--text-muted);margin:-4px 0 16px;">
            Всего готовой продукции: <strong>${totalQty} шт</strong> · общая стоимость <strong>${this._formatMoney(totalValue)}</strong>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;">
            <button class="btn btn-primary" onclick="Warehouse.showWriteOffDialog()" ${readyGoodsAvailable ? '' : 'disabled title="Нужна общая база готовой продукции"'}>📤 Списать продажу</button>
            <button class="btn btn-outline" onclick="Warehouse.showAddReadyGoodsDialog()" ${readyGoodsAvailable ? '' : 'disabled title="Нужна общая база готовой продукции"'}>+ Добавить вручную</button>
        </div>
        `;

        // Ready goods table
        if (positiveRg.length === 0) {
            html += `<div class="card"><div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>Нет готовой продукции на складе</p>
                <p style="font-size:12px;color:var(--text-muted);">${readyGoodsAvailable ? 'Товары появятся здесь после ручной приёмки B2C / партнёрского стока.' : 'Как только восстановится shared-база, здесь снова появится live-остаток готовой продукции.'}</p>
            </div></div>`;
        } else {
            const renderLocationSection = (locationType, title) => {
                const items = positiveRg.filter(item => this._normalizeReadyGoodsLocation(item.location_type) === locationType);
                const sectionQty = items.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);
                const sectionValue = items.reduce((sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.cost_per_unit) || 0), 0);
                if (items.length === 0) {
                    return `
                        <div class="card" style="margin-bottom:16px;">
                            <div style="padding:16px 18px 12px;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                                    <h3 style="margin:0;">${title}</h3>
                                    <div style="font-size:12px;color:var(--text-muted);">0 шт · ${this._formatMoney(0)}</div>
                                </div>
                                <div style="font-size:13px;color:var(--text-muted);margin-top:10px;">Здесь пока нет остатков.</div>
                            </div>
                        </div>
                    `;
                }
                const rows = items.map(item => {
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
                return `
                    <div class="card" style="margin-bottom:16px;">
                        <div style="padding:16px 18px 6px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                            <h3 style="margin:0;">${title}</h3>
                            <div style="font-size:12px;color:var(--text-muted);">${sectionQty} шт · ${this._formatMoney(sectionValue)}</div>
                        </div>
                        <div class="table-wrap"><table>
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
                        </table></div>
                    </div>
                `;
            };

            html += renderLocationSection('our', `${this._readyGoodsLocationEmoji('our')} Наш склад`);
            html += renderLocationSection('partner', `${this._readyGoodsLocationEmoji('partner')} Склад партнёра`);
        }

        // Sales history
        if (salesRecords.length > 0) {
            const salesRows = [...salesRecords].sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => {
                const locationLabel = this._readyGoodsLocationLabel(r.location_type);
                const channel = r.channel === 'marketplace' ? '🏪 Маркетплейс' : (r.channel === 'website' ? '🌐 Сайт' : '📋 Другое');
                const profit = (parseFloat(r.revenue) || 0) - (parseFloat(r.qty) || 0) * (parseFloat(r.cost_per_unit) || 0);
                return `<tr>
                    <td style="font-size:12px;">${r.date ? new Date(r.date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td style="font-weight:600;">${this.esc(r.product_name || '—')}</td>
                    <td style="font-size:12px;">${this.esc(locationLabel)}</td>
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
                    <th>Со склада</th>
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
        if (!this._isReadyGoodsSharedAvailable()) {
            App.toast('Готовая продукция недоступна без общей базы');
            return;
        }
        const rg = (await loadReadyGoods())
            .map(item => this._normalizeReadyGoodsItem(item))
            .filter(i => (parseFloat(i.qty) || 0) > 0);
        if (rg.length === 0) {
            App.toast('Нет товаров для списания');
            return;
        }

        const existing = document.getElementById('rg-writeoff-dialog');
        if (existing) existing.remove();

        const opts = rg.map((item, i) => {
            const label = `${item.product_name} · ${this._readyGoodsLocationLabel(item.location_type)} (${item.qty} шт, себест. ${this._formatMoney(item.cost_per_unit || 0)})`;
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
        if (!this._isReadyGoodsSharedAvailable()) {
            App.toast('Готовая продукция недоступна без общей базы');
            return;
        }
        const rg = (await loadReadyGoods())
            .map(item => this._normalizeReadyGoodsItem(item))
            .filter(i => (parseFloat(i.qty) || 0) > 0);
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
        const allRg = (await loadReadyGoods()).map(entry => this._normalizeReadyGoodsItem(entry));
        const rgItem = allRg.find(i => Number(i.id) === Number(item.id));
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
            location_type: this._normalizeReadyGoodsLocation(item.location_type),
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
            location_type: this._normalizeReadyGoodsLocation(item.location_type),
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
        if (!this._isReadyGoodsSharedAvailable()) {
            App.toast('Готовая продукция недоступна без общей базы');
            return;
        }
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
            <div style="margin-bottom:12px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;">Куда принимаем</label>
                <select id="rg-add-location" class="calc-input" style="width:100%;">
                    <option value="our">🏠 Наш склад</option>
                    <option value="partner">🤝 Склад партнёра</option>
                </select>
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
        if (!this._isReadyGoodsSharedAvailable()) {
            App.toast('Готовая продукция недоступна без общей базы');
            return;
        }
        const name = (document.getElementById('rg-add-name').value || '').trim();
        if (!name) { App.toast('Укажите название'); return; }
        const qty = parseInt(document.getElementById('rg-add-qty').value) || 0;
        if (qty <= 0) { App.toast('Укажите количество'); return; }
        const cost = parseFloat(document.getElementById('rg-add-cost').value) || 0;
        const locationType = this._normalizeReadyGoodsLocation(document.getElementById('rg-add-location').value);
        const setName = (document.getElementById('rg-add-set').value || '').trim();

        const rg = (await loadReadyGoods()).map(item => this._normalizeReadyGoodsItem(item));
        rg.push({
            id: Date.now(),
            product_name: name,
            order_name: 'Ручное добавление',
            order_id: null,
            marketplace_set: setName,
            location_type: locationType,
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
            location_type: locationType,
            qty,
            notes: `Ручное добавление (${this._readyGoodsLocationLabel(locationType)}): ${name} × ${qty}`,
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
        if ((data.order?.client_name || '').toUpperCase() !== 'B2C') return 0;
        const locationType = this._resolveReadyGoodsLocation(data);

        await Promise.all([
            loadReadyGoods(),
            loadReadyGoodsHistory(),
            loadSalesRecords(),
        ]);
        if (!this._isReadyGoodsSharedAvailable()) return 0;

        const rg = (await loadReadyGoods()).map(item => this._normalizeReadyGoodsItem(item));
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
                location_type: locationType,
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
                location_type: locationType,
                qty,
                cost_per_unit: costPerUnit,
                notes: `Из заказа «${orderName}» → ${this._readyGoodsLocationLabel(locationType)}: ${item.product_name} × ${qty}`,
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

    async removeOrderFromReadyGoods(orderId, orderName, nextStatus) {
        const readyGoods = (await loadReadyGoods()).map(item => this._normalizeReadyGoodsItem(item));
        const history = await loadReadyGoodsHistory();
        const nowIso = new Date().toISOString();
        const employee = App.getCurrentEmployeeName() || '';
        const remaining = [];
        let removedCount = 0;

        readyGoods.forEach(item => {
            if (Number(item.order_id) === Number(orderId)) {
                history.push({
                    id: Date.now() + removedCount + 80000,
                    type: 'return_to_order',
                    product_name: item.product_name || 'Товар',
                    order_name: item.order_name || orderName || 'Заказ',
                    location_type: this._normalizeReadyGoodsLocation(item.location_type),
                    qty: -(parseFloat(item.qty) || 0),
                    cost_per_unit: parseFloat(item.cost_per_unit) || 0,
                    notes: `Возврат из ${this._readyGoodsLocationLabel(item.location_type)}: ${App.statusLabel('completed')} → ${App.statusLabel(nextStatus)}`,
                    date: nowIso,
                    created_by: employee,
                });
                removedCount++;
                return;
            }
            remaining.push(item);
        });

        if (removedCount > 0) {
            await saveReadyGoods(remaining);
            await saveReadyGoodsHistory(history);
        }
        return removedCount;
    },

    _isReadyGoodsSharedAvailable() {
        const sourceStatus = typeof getReadyGoodsSourceStatus === 'function' ? getReadyGoodsSourceStatus() : null;
        const sourceItems = sourceStatus ? [sourceStatus.ready_goods, sourceStatus.ready_goods_history, sourceStatus.sales_records].filter(Boolean) : [];
        return sourceItems.length > 0 && sourceItems.every(item => item.source === 'shared-settings');
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
        if (this._isMoldCategory(shItem.category)) {
            const moldType = this._normalizeMoldType(shItem.mold_type);
            const linkedOrderId = Number(shItem.linked_order_id || 0) || 0;
            const templateId = this._normStr(shItem.template_id || '');
            const moldName = this._normStr(shItem.name || '');
            const byMoldKey = warehouseItems.find(i =>
                this._isMoldCategory(i.category)
                && this._normalizeMoldType(i.mold_type) === moldType
                && (
                    (linkedOrderId && Number(i.linked_order_id || 0) === linkedOrderId)
                    || (templateId && this._normStr(i.template_id || '') === templateId)
                    || (moldType === 'blank' && moldName && this._normStr(i.name || '') === moldName)
                )
            );
            if (byMoldKey) return byMoldKey;
        }
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

    async _getChinaPurchaseCached(purchaseId, cache) {
        const normalizedId = Number(purchaseId || 0);
        if (!normalizedId) return null;
        if (cache.has(normalizedId)) return cache.get(normalizedId);
        const purchase = typeof loadChinaPurchase === 'function'
            ? await loadChinaPurchase(normalizedId).catch(() => null)
            : null;
        cache.set(normalizedId, purchase || null);
        return purchase || null;
    },

    async _getOrderCached(orderId, cache) {
        const normalizedId = Number(orderId || 0);
        if (!normalizedId) return null;
        if (cache.has(normalizedId)) return cache.get(normalizedId);
        const detail = typeof loadOrder === 'function'
            ? await loadOrder(normalizedId).catch(() => null)
            : null;
        cache.set(normalizedId, detail || null);
        return detail || null;
    },

    async _resolveShipmentMoldMeta(shItem, context) {
        if (!this._isMoldCategory(shItem && shItem.category)) return null;
        const ctx = context && typeof context === 'object' ? context : {};
        const purchaseCache = ctx.purchaseCache instanceof Map ? ctx.purchaseCache : new Map();
        const orderCache = ctx.orderCache instanceof Map ? ctx.orderCache : new Map();

        let linkedOrderId = Number(shItem.linked_order_id || 0) || 0;
        let linkedOrderName = String(shItem.linked_order_name || '').trim();
        let purchase = null;
        if (!linkedOrderId && shItem.china_purchase_id) {
            purchase = await this._getChinaPurchaseCached(shItem.china_purchase_id, purchaseCache);
            linkedOrderId = Number(purchase && purchase.order_id || 0) || 0;
            if (!linkedOrderName) {
                linkedOrderName = String(purchase && (purchase.order_name || purchase.order_label) || '').trim();
            }
        }

        if (linkedOrderId && !linkedOrderName) {
            const detail = await this._getOrderCached(linkedOrderId, orderCache);
            linkedOrderName = String(detail && detail.order && detail.order.order_name || '').trim();
        }

        const moldMeta = this._buildMoldMeta(shItem, {
            mold_type: shItem.mold_type || (linkedOrderId ? 'customer' : 'blank'),
            linked_order_id: linkedOrderId,
            linked_order_name: linkedOrderName,
            mold_capacity_total: shItem.mold_capacity_total,
            mold_capacity_used: shItem.mold_capacity_used,
            mold_arrived_at: shItem.mold_arrived_at || ctx.receiptDate || '',
            mold_storage_until: shItem.mold_storage_until || '',
            receiptDate: ctx.receiptDate || '',
        });

        if (!moldMeta) return null;
        return {
            ...moldMeta,
            china_purchase_id: Number(shItem.china_purchase_id || 0) || null,
        };
    },

    _mergeMoldMetaIntoItem(item, moldMeta) {
        if (!item || !moldMeta) return item;
        const merged = { ...item, ...moldMeta };
        if (!merged.mold_capacity_total) {
            merged.mold_capacity_total = this._defaultMoldCapacityTotal(merged.mold_type);
        }
        if (!merged.mold_arrived_at) merged.mold_arrived_at = this._todayYMD();
        if (this._normalizeMoldType(merged.mold_type) === 'customer' && !merged.mold_storage_until) {
            merged.mold_storage_until = this._plusDaysYMD(merged.mold_arrived_at, 365);
        }
        if (this._normalizeMoldType(merged.mold_type) !== 'customer') {
            merged.mold_storage_until = '';
        }
        return merged;
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
            const reservedQty = activeRes.reduce((s, r) => s + this._parseWarehouseQty(r.qty), 0);
            item.available_qty = Math.max(0, this._parseWarehouseQty(item.qty) - reservedQty);
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
                        price_per_unit: this.getPickerEffectivePrice(i),
                        unit: this.getPickerUnitLabel(i),
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
                const stock = item.available_qty > 0 ? `(${item.available_qty} ${this.getPickerUnitLabel(item)})` : '(нет)';
                const sel = String(item.id) === String(selectedId) ? ' selected' : '';
                html += `<option value="${item.id}"${sel}>${label} ${stock}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    },

    _pickerIdsEqual(left, right) {
        return String(left ?? '') === String(right ?? '');
    },

    getPickerUnitLabel(item) {
        const unit = String(item?.unit || '').trim();
        return unit || 'шт';
    },

    getPickerEffectivePrice(item) {
        const rawPrice = parseFloat(item?.price_per_unit) || 0;
        const unit = this._normStr(item?.unit || '');
        const category = this._normStr(item?.category || '');
        const sku = this._normStr(item?.sku || '');

        // Some legacy warehouse cord rows were saved as RUB/m while qty is tracked in cm.
        // In pickers and downstream calculations we want the real per-cm price.
        if (unit === 'см' && rawPrice >= 10 && (category === 'cords' || sku.startsWith('msn-'))) {
            return Math.round((rawPrice / 100) * 100) / 100;
        }

        return Math.round(rawPrice * 100) / 100;
    },

    getPickerPriceLabel(item) {
        const effectivePrice = this.getPickerEffectivePrice(item);
        if (!(effectivePrice > 0)) return '';
        const formatted = new Intl.NumberFormat('ru-RU').format(effectivePrice);
        return `${formatted} ₽/${this.getPickerUnitLabel(item)}`;
    },

    _pickerMetaText(item) {
        if (!item) return '';
        if (item.meta_line) return String(item.meta_line);
        const stock = item.available_qty == null
            ? ''
            : (item.available_qty > 0 ? `${item.available_qty} ${this.getPickerUnitLabel(item)}` : 'нет');
        const priceStr = this.getPickerPriceLabel(item);
        return [item.sku || '', stock, priceStr].filter(Boolean).join(' · ');
    },

    // Custom image-based picker for calculator and other warehouse-linked pickers.
    // onSelectFn: string like "Calculator.onHwWarehouseSelect" or "Calculator.onPkgWarehouseSelect"
    // categoryFilter: null = all, 'hardware' = exclude packaging, 'packaging' = only packaging
    buildImagePicker(containerId, grouped, selectedId, onSelectFn, categoryFilter, options = {}) {
        const cat = WAREHOUSE_CATEGORIES;
        if (!onSelectFn) onSelectFn = 'Calculator.onHwWarehouseSelect';
        const idxStr = containerId.replace(/^[a-z]+-picker-/, '');
        const searchPlaceholder = options.searchPlaceholder || 'Поиск по названию или артикулу...';

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
            const selectedGroup = grouped[selectedItem.__groupKey] || {};
            const catObj = cat.find(c => c.key === selectedItem.category) || {
                icon: selectedGroup.icon || '📦',
                color: selectedGroup.color || 'var(--accent-light)',
                textColor: selectedGroup.textColor || 'var(--text)',
            };
            const photoSrc = selectedItem.photo_thumbnail || selectedItem.photo_url || '';
            const photoHtml = photoSrc
                ? `<img src="${photoSrc}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${catObj.color};border-radius:6px;font-size:18px;flex-shrink:0;">${catObj.icon}</span>`;
            selectedHtml = `${photoHtml}<span style="flex:1;min-width:0;"><b style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${parts.join(' · ')}</b><span style="font-size:11px;color:var(--text-muted);">${this._pickerMetaText(selectedItem)}</span></span>`;
        } else {
            selectedHtml = '<span style="color:var(--text-muted);font-size:13px;">— Выберите позицию —</span>';
        }

        // Build dropdown items
        let itemsHtml = '';
        for (const catKey of visibleKeys) {
            const g = grouped[catKey];
            if (!g) continue;
            const catObj = cat.find(c => c.key === catKey) || {
                icon: g.icon || '📦',
                color: g.color || 'var(--accent-light)',
                textColor: g.textColor || 'var(--text)',
            };
            itemsHtml += `<div class="wh-picker-cat-header" data-group-key="${this.esc(catKey)}" style="padding:6px 10px;font-size:11px;font-weight:700;color:${catObj.textColor};background:${catObj.color};">${g.icon || catObj.icon} ${g.label || catKey}</div>`;
            g.items.forEach(item => {
                const parts = [item.name];
                if (item.size) parts.push(item.size);
                if (item.color) parts.push(item.color);
                const label = parts.join(' · ');
                const metaText = this._pickerMetaText(item);
                const photoSrc = item.photo_thumbnail || item.photo_url || '';
                const photoHtml = photoSrc
                    ? `<img src="${photoSrc}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border);">`
                    : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:${catObj.color};border-radius:6px;font-size:20px;flex-shrink:0;">${catObj.icon}</span>`;
                const background = this._pickerIdsEqual(item.id, selectedId) ? 'rgba(59,130,246,0.1)' : 'transparent';
                itemsHtml += `<button type="button" class="wh-picker-item" data-id="${this.esc(item.id)}" data-group-key="${this.esc(catKey)}" data-picker-container="${this.esc(containerId)}" data-select-fn="${this.esc(onSelectFn)}" data-select-idx="${this.esc(idxStr)}" data-pick-value="${this.esc(item.id)}" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;cursor:pointer;border:0;border-bottom:1px solid var(--border);background:${background};text-align:left;" onmousedown="event.preventDefault()" onclick="Warehouse.handlePickerSelect(this)">
                    ${photoHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${metaText}</div>
                    </div>
                </button>`;
            });
        }

        return `<div id="${containerId}" class="wh-img-picker">
            <div class="wh-picker-selected" onclick="Warehouse.togglePicker('${containerId}')">
                ${selectedHtml}
                <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;">&#9662;</span>
            </div>
            <div class="wh-picker-dropdown" style="display:none;">
                <div style="padding:6px 8px;border-bottom:1px solid var(--border);"><input type="text" class="wh-picker-search" placeholder="${searchPlaceholder}" oninput="Warehouse.filterPicker('${containerId}', this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;"></div>
                <div class="wh-picker-list">${itemsHtml}</div>
            </div>
        </div>`;
    },

    _findInGrouped(grouped, id) {
        for (const catKey of Object.keys(grouped)) {
            const found = grouped[catKey].items.find(i => this._pickerIdsEqual(i.id, id));
            if (found) return { ...found, __groupKey: catKey };
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
            this._syncPickerHeaders(el);
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
        this._syncPickerHeaders(el);
    },

    _syncPickerHeaders(el) {
        if (!el) return;
        const items = Array.from(el.querySelectorAll('.wh-picker-item'));
        const headers = Array.from(el.querySelectorAll('.wh-picker-cat-header'));
        headers.forEach(header => {
            const groupKey = header.dataset?.groupKey || '';
            const hasVisibleItems = items.some(item => (item.dataset?.groupKey || '') === groupKey && item.style.display !== 'none');
            header.style.display = hasVisibleItems ? '' : 'none';
        });
    },

    _resolvePickerCallback(fnName) {
        const parts = String(fnName || '')
            .split('.')
            .map(part => String(part || '').trim())
            .filter(Boolean);
        if (!parts.length) return null;
        const isSafePath = parts.every(part => /^[A-Za-z_$][\w$]*$/.test(part));
        if (!isSafePath) return null;

        let target = globalThis[parts[0]] || null;
        let owner = null;
        if (!target) {
            try {
                target = Function(`return (typeof ${parts[0]} !== 'undefined' ? ${parts[0]} : null);`)();
            } catch (_) {
                target = null;
            }
        }
        owner = target;
        for (let i = 1; target && i < parts.length; i += 1) {
            owner = target;
            target = target[parts[i]];
        }
        return typeof target === 'function'
            ? { fn: target, owner }
            : null;
    },

    handlePickerSelect(buttonEl) {
        const dataset = buttonEl?.dataset || {};
        const fnName = dataset.selectFn || '';
        const pickValue = dataset.pickValue || '';
        const idxRaw = dataset.selectIdx || '';

        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');

        const resolved = this._resolvePickerCallback(fnName);
        if (!resolved || typeof resolved.fn !== 'function') {
            console.warn('[Warehouse.handlePickerSelect] callback not found:', fnName);
            return;
        }

        const numericIdx = Number(idxRaw);
        resolved.fn.call(
            resolved.owner || null,
            Number.isNaN(numericIdx) ? idxRaw : numericIdx,
            pickValue
        );
    },
};

// Close image picker dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.wh-img-picker')) {
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');
    }
});
