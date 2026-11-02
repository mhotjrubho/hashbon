const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cheshbon', {
  dashboard: (month) => ipcRenderer.invoke('dashboard:get', month),
  transactions: {
    list: (filters) => ipcRenderer.invoke('transactions:list', filters),
    add: (data) => ipcRenderer.invoke('transactions:add', data),
    update: (data) => ipcRenderer.invoke('transactions:update', data),
    remove: (id) => ipcRenderer.invoke('transactions:remove', id)
  },
  work: {
    list: (filters) => ipcRenderer.invoke('work:list', filters),
    add: (data) => ipcRenderer.invoke('work:add', data),
    remove: (id) => ipcRenderer.invoke('work:remove', id)
  },
  payslips: {
    list: () => ipcRenderer.invoke('payslips:list'),
    import: () => ipcRenderer.invoke('payslips:import'),
    update: (data) => ipcRenderer.invoke('payslips:update', data),
    remove: (id) => ipcRenderer.invoke('payslips:remove', id),
    open: (id) => ipcRenderer.invoke('payslips:open', id),
    ocr: (id) => ipcRenderer.invoke('payslips:ocr', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (data) => ipcRenderer.invoke('settings:save', data)
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import')
  },
  appInfo: () => ipcRenderer.invoke('app:info')
});