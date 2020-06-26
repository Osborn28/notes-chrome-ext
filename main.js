let editor = undefined
let activeId = '0'
let activeItems = {}
let dom = {}
const cacheMaxSize = 4 //后悔药
let _inputFocus = false


const nopFunction = () => {}
const initDom = () => {
  dom = {
    layout: document.getElementById('layout'),
    selector: document.getElementById('selector'),
    input: document.getElementById('input'),
    revert: document.getElementById('revert'),
  }
}

const setInputValue = (val) => {
  dom.input.value = val
}

const createMarkdown = markdown => {
  if (editor) { // only one editormd instance
    editor.editor.remove()
  }
  createEditorDom()
  document.getElementById('content').value = markdown
  editor = editormd('editor', {
    width: "100%",
    height: 720,
    placeholder : "think before you write...",
    taskList : true,
    tex : true,
    emoji : true,
    onchange : function () {
      let content = document.getElementById('content')
      if (!content) return
      chrome.storage.sync.set({[activeId]: content.value}, function() {
        chrome.runtime.sendMessage({
          type: 'update',
          id: activeId
        })
      })
    },
    // markdown: markdown,     // dynamic set Markdown text
    path : "editor.md/lib/"  // Autoload modules mode, codemirror, marked... dependents libs path
  })
}

const createEditorDom = () => {
  let div = document.createElement('div')
  let textarea = document.createElement('textarea')
  div.id = 'editor'
  textarea.style = "display:none;height:100%"
  textarea.id = 'content'
  div.appendChild(textarea)

  dom.layout.appendChild(div)
}

const recreateMarkdown = id => {
  chrome.storage.sync.get(id, data => {
    createMarkdown(data[id])
  })
}

function pageLoadHandler() {
    initDom()
    initListener()
    chrome.storage.sync.get('nodeList', (data) => {
      createList(data.nodeList)
      setInputValue(data.nodeList[activeId] && data.nodeList[activeId].name || '')
      recreateMarkdown(activeId)
    })
}

function selectorListener (e) {
  let target = e.target
  let targetType = target.nodeName.toLocaleLowerCase()
  let id = target.id || target.parentNode.id
  if (targetType === 'div') {
    if (activeId === id) return
    activeItems[activeId].active = false
    activeItems[id].active = true
    activeId = id
    setInputValue(activeItems[id].name)
    chrome.storage.sync.set({'nodeList': activeItems}, nopFunction)
    recreateMarkdown(activeId)
  } else if (targetType === 'img') {
    deleteListener(id)
  }
}

function createListDom (activeItems, isNeedRender) {
  if (!isNeedRender) {
    dom.selector.style.visibility = 'hidden'
    return
  }

  while (dom.selector.firstChild) {
    dom.selector.removeChild(dom.selector.firstChild)
  }

  dom.selector.style.visibility = 'visible'
  const fragment = document.createDocumentFragment()
  Object.keys(activeItems).forEach((i, idx) => {
    const div = document.createElement('div')
    const span = document.createElement('div')
    const close = document.createElement('img')
    close.src = './images/close.svg'
    close.className = 'selector__item-delete'
    span.className = 'selector__item-span'
    div.appendChild(span)
    div.appendChild(close)
    span.innerText = activeItems[i].name
    div.className = 'selector__item ' 
    if (activeItems[i].active) {
      div.className += activeItems[i] ? ' active' : ''
      activeId = i
    }
    div.id = i
    fragment.appendChild(div)
  })
  dom.selector.appendChild(fragment)
}
function createList (arr = {}, isNeedRender = false) {
  const len = Object.keys(arr) // {id: isActive | boolean}
  activeItems = arr
  if (len.length === 0) { // empty
    activeItems[0] = {
      active: true,
      name: 'note'
    }
    chrome.storage.sync.set({'nodeList': activeItems}, nopFunction)
  } else {
    activeId = Object.keys(activeItems).find(id => {
      return activeItems[id].active
    }) || Object.keys(activeItems)[0] || '0'
  }
  createListDom(activeItems ,isNeedRender)
} 

function deleteListener (id) {
  let keys = Object.keys(activeItems)
  if (keys.length === 1) return 

  
  chrome.storage.sync.get('lastCache', function(data) {
    let res = data.lastCache
    let needDelete = undefined
    if (!res || res.length < 1) {
      res = []
    }
    if (!res.some(item => item.id === id)) {
      res.push({
        id: id,
        name: activeItems[id].name
      })
    }
    if (res.length >= cacheMaxSize) {
      needDelete = res.shift()
    }
    chrome.storage.sync.set({'lastCache': res}, nopFunction)

    delete activeItems[id]
    chrome.storage.sync.set({'nodeList': activeItems}, () => {
      chrome.runtime.sendMessage({
        type: 'delete',
        id: id
      })
    })
    needDelete && chrome.storage.sync.remove(String(needDelete.id), nopFunction)

    if (activeId === id) {
      activeId = Object.keys(activeItems)[0]
      recreateMarkdown(activeId)
    }
  })
}

function revertListener () {
  chrome.storage.sync.get('lastCache', function(data) {
    let res = data.lastCache
    if (!res || res.length < 1) {
      return
    }
    let _active = res.pop()
    chrome.storage.sync.set({'lastCache': res}, nopFunction)

    activeItems[_active.id] = {
      active: true,
      name: _active.name
    }
    activeItems[activeId].active = false
    activeId = _active.id
    chrome.runtime.sendMessage({
      type: 'add',
      id: activeId,
      name: _active.name
    })
    chrome.storage.sync.set({'nodeList': activeItems}, nopFunction)
    chrome.storage.sync.get(activeId, (data) => {
      setInputValue(_active.name)
      createMarkdown(data[activeId])
    })
  })
}
const _getItems = (activeItems, value) => {
  let newList = {}
  for (let id in activeItems) {
    if (String(activeItems[id].name).indexOf(value) >= 0) {
      newList[id] = activeItems[id]
    } 
  }
  return newList
}
function inputBlurListener () {
  _inputFocus = false
  setTimeout(() => {
    setInputValue(activeItems[activeId].name)
    createListDom({}, false)
  }, 200)
}

function inputInputListener (e, val) {
  let value = e ? e.target.value.trim() : val
  let newList = _getItems(activeItems, value)
  let isNeedRender = Object.keys(newList).length > 0
  createListDom(newList, isNeedRender)
}
function inputEnterListener (e) {
  if (e.key === 'Enter') {
    let value = e.target.value.trim()
    let newList = _getItems(activeItems, value)
    let flag = Object.keys(newList).find(i => {
      return value === newList[i].name
    })
    if (flag === undefined) {
      newCache(value)
    } else {
      let id = flag
      if (activeId === id) return
      activeItems[activeId].active = false
      activeItems[id].active = true
      activeId = id
      setInputValue(activeItems[id].name)
      chrome.storage.sync.set({'nodeList': activeItems}, nopFunction) 
      recreateMarkdown(activeId)
    }
  }
}
function chromeRuntimeListener (request) {
  const _update = (id) => {
    if (id === activeId) {
      location.reload()
    } 
  }
  const _delete = (id) => {
    if (id === activeId) {
      location.reload()
    } else {
      // 移除dom即可
      delete activeItems[id]
    }
  }
  const _add = (id, name) => {
    activeItems[id] = {
      active: false,
      name: name
    }
  }
  const dealFunctions = {
    update: _update,
    delete: _delete,
    add: _add
  }
  let type = request.type
  console.log(request)
  dealFunctions[type](String(request.id), request.name)  
}
function initListener () {
  dom.input.addEventListener('blur', inputBlurListener)
  dom.input.addEventListener('input', inputInputListener)
  dom.input.addEventListener('keypress', inputEnterListener)
  dom.input.addEventListener('click', () => {
    if (!_inputFocus) {
      setInputValue('')
      inputInputListener(undefined, '')
    }
    _inputFocus = true
  })
  dom.selector.addEventListener('click', selectorListener)
  dom.revert.addEventListener('click', revertListener)
  chrome.runtime.onMessage.addListener(chromeRuntimeListener)
}

function newCache (name) {
  activeItems[activeId].active = false 
  activeId = Math.max(...Object.keys(activeItems).map(i => Number(i))) + 1

  activeItems[activeId] = {
    active: true,
    name: name
  }
  chrome.storage.sync.set({'nodeList': activeItems}, () => {
    chrome.runtime.sendMessage({
      type: 'add',
      id: activeId,
      name: name
    })
  })
  createMarkdown('')
}

window.addEventListener('load', pageLoadHandler)
