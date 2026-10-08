// Unit tests for the PLAYNC character search mapping (website data only).
import { describe, expect, it } from 'vitest'
import { DEF_UI, setU } from '@/core/state'
import { detailUrl, emptyDetail, imgUrl, mapProfile, parseSearch, searchUrl, stripTags } from '@/features/progress/plaync'

setU(structuredClone(DEF_UI))

const SEARCH = {
  list: [{
    characterId: 'V0E539Yq3qbVd9wpJHNAc9tJlQ3nHAsGeiGFf_Ayjs0%3D', name: '<strong>Mar</strong>', race: 2, pcId: 24, level: 16,
    serverId: 2307, serverName: 'Ereshkigal', profileImageUrl: '/game_profile_images/aion2global/images?gameServerKey=2307&charKey=1', region: 'eu',
  }],
  pagination: { page: 1, size: 20, total: 1 },
}
const NULL_DETAIL = {
  profile: { characterId: null, characterLevel: null, characterName: null, className: null, combatPower: null, profileImage: null, raceId: null, serverName: '', titleName: '' },
  stat: { statList: null }, title: { ownedCount: null, titleList: null, totalCount: null }, ranking: { rankingList: null }, daevanion: { boardList: null },
}

describe('PLAYNC character search', () => {
  it('strips the highlight tags from names', () => {
    expect(stripTags('<strong>Mar</strong>ius')).toBe('Marius')
    expect(stripTags(null)).toBe('')
  })
  it('prefixes relative portrait paths', () => {
    expect(imgUrl('/game_profile_images/x?a=1')).toBe('https://profileimg.plaync.com/game_profile_images/x?a=1')
    expect(imgUrl('https://profileimg.plaync.com/y')).toBe('https://profileimg.plaync.com/y')
    expect(imgUrl(null)).toBe('')
  })
  it('maps search hits and keeps the encoded id for the detail URL', () => {
    const [h] = parseSearch(SEARCH, 'eu')
    expect(h).toMatchObject({ name: 'Mar', level: 16, serverId: 2307, server: 'Ereshkigal', race: 2, region: 'eu' })
    expect(h.img).toMatch(/^https:\/\/profileimg\.plaync\.com\/game_profile_images\//)
    expect(detailUrl(h)).toContain('characterId=V0E539Yq3qbVd9wpJHNAc9tJlQ3nHAsGeiGFf_Ayjs0%3D&serverId=2307&region=eu')
    expect(searchUrl(' Mar ', 'nae')).toContain('keyword=Mar&region=nae')
    expect(parseSearch({ list: null }, 'eu')).toEqual([])
  })
  it('falls back to the search data when the detail is all null', () => {
    const [h] = parseSearch(SEARCH, 'eu')
    expect(emptyDetail(NULL_DETAIL)).toBe(true)
    const p = mapProfile(NULL_DETAIL, h, 1000)
    expect(p).toMatchObject({ name: 'Mar', level: 16, server: 'Ereshkigal', race: 2, cls: '', cp: null, titles: null, at: 1000 })
    expect(p.img).toBe(h.img)
  })
  it('takes class, CP and titles from the detail', () => {
    const [h] = parseSearch(SEARCH, 'eu')
    const d = {
      profile: { characterName: 'Mar', characterLevel: 17, className: 'Spiritmaster', combatPower: 9519, raceId: 2, serverName: 'Ereshkigal', profileImage: 'https://profileimg.plaync.com/z', titleName: '' },
      title: { ownedCount: 13, totalCount: 297, titleList: [{ equipCategory: 'Attack', ownedCount: 6, totalCount: 103 }] },
    }
    expect(emptyDetail(d)).toBe(false)
    expect(mapProfile(d, h)).toMatchObject({ level: 17, cls: 'Spiritmaster', cp: 9519, img: 'https://profileimg.plaync.com/z', titles: { owned: 13, total: 297 }, titleCats: [{ cat: 'Attack', owned: 6, total: 103 }] })
  })
})
