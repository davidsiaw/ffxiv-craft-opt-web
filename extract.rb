# frozen_string_literal: true

require 'csv'
require 'json'

class FFXIVData
  def initialize(name)
    @csv = CSV.read(name)
  end

  def header
    @csv[1]
  end

  def hash
    @hash ||= @csv[4..-1].map do |x|
      m = header[1..-1].zip(x[1..-1]).to_h
      [x[0], m]
    end.to_h
  end
end

class RecipeData
  attr_reader :sugg_ctrl, :sugg_crsp

  def initialize(recipedata, leveltable, items)
    @recipedata = recipedata
    @leveltable = leveltable
    @items = items
    @sugg_ctrl = {}
    @sugg_crsp = {}
  end

  def craftype
    {
      0 => 'Carpenter',
      1 => 'Blacksmith',
      2 => 'Armorer',
      3 => 'Goldsmith',
      4 => 'Leatherworker',
      5 => 'Weaver',
      6 => 'Alchemist',
      7 => 'Culinarian'
    }
  end

  def hash(type)
    @hash ||= {}
    @hash[type] ||= @recipedata.hash
                               .reject { |_k, v| v['Item{Result}'] == '0' }
                               .select { |_k, v| v['CraftType'] == type.to_s }
                               .map do |_k, v|
      resultid = v['Item{Result}']

      leveltable_id = v['RecipeLevelTable']

      item = @items.hash[resultid]
      info = @leveltable.hash[leveltable_id]

      name = item['Name']
      patch = v['PatchNumber'].to_i
      name = "#{item['Name']} (Patch #{patch / 100.0})" if patch.nonzero?

      diff = v['DifficultyFactor'].to_i * info['Difficulty'].to_i / 100
      qual = v['QualityFactor'].to_i * info['Quality'].to_i / 100
      dura = v['DurabilityFactor'].to_i * info['Durability'].to_i / 100

      [item['Name'], {
        "baseLevel": info['ClassJobLevel'].to_i,
        "difficulty": diff,
        "durability": dura,
        "id": v['Number'],
        "level": item['Level{Item}'].to_i,
        "maxQuality": qual,
        'sctrl': info['SuggestedControl'].to_i,
        'scraft': info['SuggestedCraftsmanship'].to_i,
        "name": {
          "cn": name,
          "de": name,
          "en": name,
          "fr": name,
          "ja": name,
          "ko": name
        },
        "stars": info['Stars'].to_i
      }]
    end.to_h
  end
end

recipes_csv = FFXIVData.new('../ffxiv-datamining/csv/Recipe.csv')
lvltable_csv = FFXIVData.new('../ffxiv-datamining/csv/RecipeLevelTable.csv')
items_csv = FFXIVData.new('../ffxiv-datamining/csv/Item.csv')

rd = RecipeData.new(recipes_csv, lvltable_csv, items_csv)

(0..7).each do |x|
  p rd.craftype[x]
  File.write("app/data/recipedb/#{rd.craftype[x]}.json", JSON.pretty_generate(rd.hash(x).values.sort_by{ |x| x[:baseLevel]}))
end
