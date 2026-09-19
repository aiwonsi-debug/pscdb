'use strict';

const DRIVE_DATA_FOLDER_ID = '11L80cwOkWDEZJCxVD4SghI7zfrfwj9yL';

const WORKBOOK_IDS = Object.freeze({
  farmOps: '195Foz8mjcLt1q5agCh28FoyJkg4VxGhMt86XqX7ZSCM',
  materialPrices: '1-2n4Q2XYjGyRqoogAnS_Id1tGzUBq2bKHvHVKeXEYXM',
  physicalStock: '1LhS7R0GeFiQ4PR_2tXqVgkFRBYX3jXSvdC0yHiOEIEM',
  customerPos: '1FfkSYTCxUFYj3dE6VHAOWEqDa4MVU3yMz7rwjefh-Ig',
  lineSyncDatabase: '1L_C9vZUOV28I4LejJcw16ey-tLvimVuw0euNWuaLFdo'
});

function csvExportUrl(workbookId, gid) {
  const query = gid === undefined ? 'format=csv' : `format=csv&gid=${encodeURIComponent(gid)}`;
  return `https://docs.google.com/spreadsheets/d/${workbookId}/export?${query}`;
}

module.exports = {
  DRIVE_DATA_FOLDER_ID,
  WORKBOOK_IDS,
  csvExportUrl
};
