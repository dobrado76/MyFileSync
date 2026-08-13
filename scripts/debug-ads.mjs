import koffi from 'koffi'
import path from 'node:path'

const sourcePath = path.resolve('test/fixtures/ntfs/generated/sample-with-ads.txt')

const WIN32_FIND_STREAM_DATA = koffi.struct('WIN32_FIND_STREAM_DATA', {
  StreamSize: 'int64',
  cStreamName: koffi.array('char16', 296),
})

const kernel32 = koffi.load('kernel32.dll')
const FindFirstStreamW = kernel32.func('FindFirstStreamW', 'void *', [
  'str16', 'uint32', 'WIN32_FIND_STREAM_DATA *', 'uint32 *',
])
const FindNextStreamW = kernel32.func('FindNextStreamW', 'bool', [
  'void *', 'WIN32_FIND_STREAM_DATA *',
])
const FindClose = kernel32.func('FindClose', 'bool', ['void *'])

const data = koffi.alloc(WIN32_FIND_STREAM_DATA, 1)
const findHandle = FindFirstStreamW(sourcePath, 0, data, null)

if (findHandle) {
  do {
    const entry = koffi.decode(data, WIN32_FIND_STREAM_DATA)
    console.log(JSON.stringify({ name: entry.cStreamName, size: entry.StreamSize.toString() }))
  } while (FindNextStreamW(findHandle, data))
  FindClose(findHandle)
}
