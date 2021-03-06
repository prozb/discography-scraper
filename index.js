const puppeteer = require('puppeteer');
const cheerio   = require('cheerio');
const fs        = require('fs');
/**
 * Parsing wikipedia pages to create datasets of different bands
 * @author Pavlo Rozbytskyi
 * @version 1.0.0
 */

/**
 * starting parsing process
 * @param {string} pageHTML - html code of the page 
 */
const scrapeAlbums = async (pageHTML) => {
  let $ = cheerio.load(pageHTML);
  // getting parsing output 
  let elements = $('.mw-parser-output').children();
  let index = 0; 
  // getting index of h2 after which is stored content
  for(let i = 0; i < elements.length; i++){
    if(elements[i].name === 'h2'){
      index = i;
      break;
    }
  }

  let filtered = elements.slice(++index);
  // first and last element of studio alums 
  let startAdding = false;
  let newFiltered = [];
  //extracting content from the website
  for(let i = 0; i < filtered.length; i++){
    let current = filtered[i];
    //starting to add all elements into new array
    if(startAdding){
      newFiltered.push(current);
    }
    //parse data if is studio album table or 
    if(current.name === 'h3'){
      if(current.firstChild.attribs.id === 'Studio_albums'){
        startAdding = true;
      }else{
        startAdding = false;
      }
    }
  }
  newFiltered.pop();
  // getting all tables and ignore all another tags
  newFiltered = newFiltered.filter(e => e.name === 'table');
  // not new filtered array contains only needed elements
  let albums = parseTables(newFiltered);

  return albums;
}
/**
 * parsing all tables
 * @param {Array} tables 
 */
const parseTables = tables => {
  let albums = [];
  // iteratign over all tables
  for(let i = 0; i < tables.length; i++){
    let tbody = getChildren(tables[i]).find(child => child.tagName === 'tbody');
    let rows = getChildren(tbody);
    // iterating over all rows of the table 
    // the first is table header, thats why we skip it
    for(let j = 1; j < rows.length; j++){
      // if row has now data, skipping
      if(!checkHasRowData(rows[j])) continue;
      // extracting data row
      let album = getAlbumFromRow(rows[j]);
      albums.push(album);
    }
  } 

  return albums;
}

/**
 * checking row contains data, if not ignore
 * @param {CheerioElement} row 
 */
const checkHasRowData = row => {
  return getChildren(row).find(element => element.tagName === 'td' && !element.attribs.colspan);
}
/**
 * getting album from row
 * @param {CheerioObject} row 
 */
const getAlbumFromRow = row => {
  let album = {};
  let rowElems = getChildren(row);
  // extracting header and data from row
  let albumInfo  = getAlbumInfo(rowElems[1]);
  // extracting links from table row header column
  let albumLinks = getAlbumLinks(rowElems[0]);

  try{
    album.url       = albumLinks.url;
    album.id        = albumLinks.id;
    album.released  = albumInfo.released;
    album.recorded  = albumInfo.recorded;
    album.label     = albumInfo.label;
  }catch(e) {
    console.error(e);
  }
  return album;
}
/**
 * extracting link to album and name of the album 
 * from thable row header column 
 * @param {CheerioElement} header 
 */
const getAlbumLinks = header => {
  let info = {};
  // getting all children of table row header column
  getChildren(header).forEach(child => {
    let i = getChildren(child);
    let a = i.find(tag => tag.tagName === 'a');
    // checking tag i contains element a
    if(child && a && a.attribs && a.attribs){
      // extracting href and title
      if(a.attribs.href){
        info.url = 'https://en.wikipedia.org/' + a.attribs.href;
      }
      if(a.attribs.title){
        info.id  = a.attribs.title;
        return info;
      }
    }
  });

  return info;
}
/**
 * extracting album information form table row data column
 * @param {CheerioElement} element 
 */
const getAlbumInfo = element => {
  let albumInfo = {};
  // extracting children from data column and 
  // getting first ul
  let info = [];
  try{
    info = getChildren(element).find(elem => elem.tagName === 'ul');
  }catch(e){
    console.log();
  }
  if(!info)
    return '';
  // extracting list items from list 
  let ul = getChildren(info);

  ul.forEach(li => {
    if(li.tagName === 'li'){
      // getting first child of li
      let childLi = li.firstChild;
      if(!childLi) return albumInfo;
      //extract release date
      if(childLi.data && childLi.data.includes('Released')){
        albumInfo.released = childLi.data.replace('Released: ', '');
      }
      // extracting record dates
      if(childLi.data && childLi.data.includes('Recorded')){
        albumInfo.recorded = childLi.data.replace('Recorded: ', '');
      }
      // extracting label
      if(childLi.data && childLi.data.includes('Label')){
        // there are two cases to extract label: 
        // 1. when list item contains link to label
        if(childLi.next && childLi.next.tagName && childLi.next.tagName === 'a' && 
           childLi.next.firstChild && childLi.next.firstChild.data){
          albumInfo.label = childLi.next.firstChild.data;
        // 2. when label is hardcoded in li as data
        }else{
          albumInfo.label = childLi.data.replace('Label: ', '');
        }
      }
    }
  });
  return albumInfo;
}

/**
 * Scraping general information about album
 * @param {string} html 
 */
const scrapeInfo = html => {
  let info = {};
  let $    = cheerio.load(html);
  // getting tbody with information about the discography
  let tbody = $('table.infobox tbody');
  // getting image of the discography
  let img   = tbody.find('tr td a img');
  // if the image is found, get info about it 
  if(img && img.length > 0 && img[0] && img[0].attribs){
    // storing alt
    if(img[0].attribs.alt)
      info.alt = img[0].attribs.alt;
    // storing src
    if(img[0].attribs.src)
      info.src = "https:" + img[0].attribs.src;
  }
  // get first tr where is stored info about name of the band
  let span = tbody.first().find('th span[class=fn]').first();
  // extracting name of the discography
  if(span[0] && span[0].children && span[0].children.length > 0 && span[0].children[0] &&
      span[0].children[0].data){
    info.name = span[0].children[0].data;
  }
  // extracting all rows, where are th and td
  let allTR = tbody.find('tr').has('th').has('td');
  // here are stored all types of albums of the band and 
  // count of this albums
  let types = [];
  allTR.get().forEach(tr => {
    let type = {}
    let row = getChildren(tr); 
    if(row.length < 2) return;
    // getting header and data
    let th = row[0];
    let td = row[1];
    
    let field = "";
    let value = "";
    // getting field and value
    if(th && th.firstChild && th.firstChild.data)
      field = th.firstChild.data;
    if(td && td.firstChild && td.firstChild.data)
      value = td.firstChild.data;
    
    if(field !== ""){
      type[field] = value;
      types.push(type);
    }
  });
  info.types = types;
  return info;
} 
/**
 * getting children of the element, needed beacause 
 * wikipedia lua parser creates some blank elements 
 * that may make data 
 * @param {CheerioElement} element 
 */
const getChildren = element => element.children.filter(e => e.type != 'text');

(async () => {
  console.time('Scraping time'); 
  if(process.argv.length < 3){
    console.error('Please specify wikipedia link to discography.')
    process.exit(1);
  }
  // url to parse
  const url = process.argv[2];
  // starting headless browser
  const browser = await puppeteer.launch();
  const page    = await browser.newPage();
  await page.goto(url);
  // await page.goto('https://en.wikipedia.org/wiki/Miles_Davis_discography');
  // await page.goto('https://en.wikipedia.org/wiki/Iron_Maiden_discography');
  // await page.goto('https://en.wikipedia.org/wiki/Justin_Bieber_discography');
  let bodyHTML     = await page.evaluate(() => document.body.innerHTML);
  let albums       = await scrapeAlbums(bodyHTML); 
  let info         = await scrapeInfo(bodyHTML); 
  let albumsString = JSON.stringify(albums);
  let infoString   = JSON.stringify(info);

  await fs.writeFile('albums.json', albumsString, 'utf8', () => {
   console.info("Storing %d albums of %s", albums.length, info.name);
  });  
  await fs.writeFile('meta.json', infoString, 'utf8', () => {
   console.info("Storing metadata");
  });  
  await browser.close();

  console.timeEnd('Scraping time');
})();


