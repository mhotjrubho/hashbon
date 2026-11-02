const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cheshbon', {
  getDashboard: () => ipcRenderer.invoke('dashboard:get'),
  addTransaction: (item) => ipcRenderer.invoke('transactions:add', item),
  listTransactions: () => ipcRenderer.invoke('transactions:list'),
  listPayslips: () => ipcRenderer.invoke('payslips:list')
});